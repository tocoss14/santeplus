import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import { api } from '../../../api';
import { ErrorBanner, Spinner } from '../../../components/ui';

type ScanType = 'PRESCRIPTION' | 'CARD' | 'ENTENTE';
type ScanResult = { type: ScanType; token: string; payload: any } | null;
type RecentScan = { token: string; type: ScanType; scannedAt: string };

const RECENT_SCANS_KEY = 'provider-mobile-recent-scans';

export function resolveQrVerifyPayload(rawToken: string): Record<string, string> {
  let value = rawToken.trim();
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      const candidate = parsed?.t ?? parsed?.token;
      if (typeof candidate === 'string' && candidate.length > 0) value = candidate;
    } catch {
      const match = value.match(/"(?:t|token)"\s*:\s*"([^"]+)"/);
      if (match) value = match[1];
    }
  }
  value = value.replace(/^"|"$/g, '');
  if (/^CTR-/i.test(value)) return { contractNumber: value };
  if (value.startsWith('tok_') || value.length >= 20) return { cardToken: value };
  return { memberNumber: value };
}

function loadRecentScans(): RecentScan[] {
  try {
    const raw = localStorage.getItem(RECENT_SCANS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export default function MobileScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>(() => loadRecentScans());
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    const checkOnline = () => setOfflineMode(!navigator.onLine);
    checkOnline();
    window.addEventListener('online', checkOnline);
    window.addEventListener('offline', checkOnline);
    return () => {
      window.removeEventListener('online', checkOnline);
      window.removeEventListener('offline', checkOnline);
      stopCamera();
    };
  }, []);

  const rememberScan = (token: string, type: ScanType) => {
    setRecentScans(previous => {
      const next = [{ token, type, scannedAt: new Date().toISOString() }, ...previous.filter(scan => scan.token !== token)].slice(0, 10);
      try {
        localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(next));
      } catch {
        // Le stockage local est seulement un confort : ne jamais bloquer le scan.
      }
      return next;
    });
  };

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanningRef.current = true;
        setScanning(true);
        scanLoop();
      }
    } catch (e: any) {
      setError('Impossible d\'accéder à la caméra : ' + e.message);
    }
  };

  const stopCamera = () => {
    scanningRef.current = false;
    setScanning(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const scanLoop = () => {
    if (!scanningRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(scanLoop);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
        if (code?.data) {
          stopCamera();
          void verifyScan(code.data.trim());
          return;
        }
      } catch (e) {
        console.error('[MobileScan] frame error', e);
      }
    }
    requestAnimationFrame(scanLoop);
  };

  const verifyScan = async (rawToken: string) => {
    const token = rawToken.trim();
    if (!token) {
      setError('Code vide — réessayez le scan ou la saisie manuelle.');
      return;
    }
    let type: ScanType = 'PRESCRIPTION';
    if (/^(CARD-|CTR-|tok_|MEM-)/i.test(token)) type = 'CARD';
    else if (/^(ENT-|HOS-)/i.test(token)) type = 'ENTENTE';

    if (!navigator.onLine) {
      rememberScan(token, type);
      setResult({ type, token, payload: { offline: true } });
      setError('Réseau indisponible — code enregistré localement. Vérifiez-le dès la reconnexion.');
      return;
    }

    stopCamera();
    setProcessing(true);
    setError(null);
    try {
      if (type === 'PRESCRIPTION') {
        const payload = token.startsWith('{') || token.startsWith('ORD-')
          ? { qrToken: token }
          : { number: token };
        const res = await api.post('/provider/prescriptions/scan', payload);
        rememberScan(token, type);
        setResult({ type, token, payload: res });
      } else if (type === 'CARD') {
        const res = await api.post('/provider/verify', resolveQrVerifyPayload(token));
        rememberScan(token, type);
        setResult({ type, token, payload: res });
      } else {
        rememberScan(token, type);
        setResult({ type, token, payload: { reference: token } });
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de vérification');
    } finally {
      setProcessing(false);
    }
  };

  const handleManualInput = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const token = new FormData(form).get('token') as string;
    if (token) await verifyScan(token);
    form.reset();
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
    startCamera();
  };

  return (
    <div className="px-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg">Scanner QR</h1>
        <span className={`badge ${offlineMode ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {offlineMode ? 'Hors-ligne' : 'En ligne'}
        </span>
      </div>

      <ErrorBanner message={error} />

      {/* Zone caméra / résultat */}
      <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden">
        {scanning && !result && (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            {/* Cadre de visée */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-2 border-white/50 rounded-lg relative">
                <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-brand-500" />
                <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-brand-500" />
                <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-brand-500" />
                <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-brand-500" />
              </div>
            </div>
            <div className="absolute bottom-4 left-4 right-4 text-center text-white text-sm">
              Pointez vers un code QR (ordonnance, carte, entente)
            </div>
          </>
        )}

        {!scanning && !result && (
          <div className="w-full h-full flex flex-col items-center justify-center text-white p-4">
            <div className="text-6xl mb-3">📷</div>
            <p className="text-lg font-medium">Scanner un code QR</p>
            <p className="text-sm opacity-70 mt-1">Ordonnance · Carte assuré · Entente hospitalière</p>
            <button onClick={startCamera} className="btn-primary mt-4">Ouvrir caméra</button>
          </div>
        )}

        {result && (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-white">
            <div className="text-5xl mb-2">
              {result.type === 'PRESCRIPTION' ? '💊' : result.type === 'CARD' ? '🪪' : '🏥'}
            </div>
            <h2 className="font-semibold text-lg capitalize">{result.type.toLowerCase()} détecté</h2>
            <p className="text-xs opacity-70 mt-1 font-mono">{result.token}</p>
            {result.payload?.offline && (
              <div className="mt-2 p-2 bg-amber-900/50 rounded text-xs text-center">
                Réseau indisponible — code enregistré localement. Vérifiez-le dès la reconnexion.
              </div>
            )}
            <div className="mt-4 flex gap-3 w-full max-w-xs">
              <button onClick={clearResult} className="btn-outline flex-1 text-white border-white/50">Re-scanner</button>
              {result.type === 'PRESCRIPTION' && (result.payload?.id || result.payload?.number) && (
                <Link
                  to={`/prestataire/delivrances?ordonnance=${encodeURIComponent(result.payload?.id ?? result.payload?.number ?? result.token)}`}
                  className="btn-primary flex-1 text-center"
                >
                  Délivrer
                </Link>
              )}
              {result.type === 'CARD' && (
                <Link
                  to={`/prestataire/verifier?token=${encodeURIComponent(result.token)}`}
                  className="btn-primary flex-1 text-center"
                >
                  Vérifier
                </Link>
              )}
              {result.type === 'ENTENTE' && (
                <Link to="/prestataire/hospitalisation" className="btn-primary flex-1 text-center">
                  Ententes
                </Link>
              )}
            </div>
          </div>
        )}

        {processing && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
            <Spinner />
            <span className="ml-2 text-white">Vérification…</span>
          </div>
        )}
      </div>

      {/* Saisie manuelle */}
      <form onSubmit={handleManualInput} className="card-p space-y-3">
        <h3 className="font-semibold">Ou saisir le code manuellement</h3>
        <div className="flex gap-2">
          <input
            name="token"
            className="input flex-1 font-mono text-sm"
            placeholder="ORD-... / tok_... / CTR-... / HOS-..."
            autoComplete="off"
            required
          />
          <button type="submit" className="btn-primary" disabled={processing}>Vérifier</button>
        </div>
      </form>

      {/* Historique récent */}
      <section className="space-y-2">
        <h3 className="font-semibold">Scans récents</h3>
        {recentScans.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun scan enregistré sur cet appareil pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {recentScans.map(scan => (
              <li key={scan.token} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-slate-500 truncate">{scan.token}</span>
                <button
                  type="button"
                  className="ml-auto btn-outline btn-sm"
                  disabled={processing}
                  onClick={() => verifyScan(scan.token)}
                >
                  Revérifier
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}