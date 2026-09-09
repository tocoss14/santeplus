import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api';
import { ErrorBanner, Spinner, StatusBadge } from '../../../components/ui';
import { computeHash, enqueueDelivery } from '../../../lib/offlineQueue';

type ScanType = 'PRESCRIPTION' | 'CARD' | 'ENTENTE';
type ScanResult = { type: ScanType; token: string; payload: any } | null;

export default function MobileScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

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
        setScanning(true);
        scanLoop();
      }
    } catch (e: any) {
      setError('Impossible d\'accéder à la caméra : ' + e.message);
    }
  };

  const stopCamera = () => {
    setScanning(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const scanLoop = () => {
    if (!scanning || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(scanLoop);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Lecture QR via lecture native (ex: jsQR serait mieux, ici on simule)
    // En production, utiliser jsQR ou @zxing/browser
    requestAnimationFrame(scanLoop);
  };

  // Simulation détection QR (remplacer par vraie lib en prod)
  const simulateScan = async (token: string) => {
    stopCamera();
    setProcessing(true);
    setError(null);
    // Détecter le type selon le préfixe
    let type: ScanType = 'PRESCRIPTION';
    if (token.startsWith('CARD-')) type = 'CARD';
    else if (token.startsWith('ENT-')) type = 'ENTENTE';

    try {
      const res = await api.post('/provider/verify-qr', { token, type });
      setResult({ type, token, payload: res });
    } catch (e: any) {
      // Mode hors-ligne : mettre en queue
      if (offlineMode || e.message?.includes('Network')) {
        const { enqueueDeliveryWithHash } = await import('../../../lib/offlineQueue');
        await enqueueDeliveryWithHash({ endpoint: '/provider/verify-qr', body: { token, type } }, 'provider');
        setError('Hors-ligne — scan mis en file d\'attente pour sync');
        setResult({ type: 'PRESCRIPTION', token, payload: { queued: true } });
      } else {
        setError(e.message ?? 'Erreur de vérification');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleManualInput = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const token = new FormData(form).get('token') as string;
    if (token) await simulateScan(token.trim());
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
            {result.payload?.queued && (
              <div className="mt-2 p-2 bg-amber-900/50 rounded text-xs text-center">
                Mis en file d'attente — sera traité à la reconnexion
              </div>
            )}
            <div className="mt-4 flex gap-3 w-full max-w-xs">
              <button onClick={clearResult} className="btn-outline flex-1 text-white border-white/50">Re-scanner</button>
              {result.type === 'PRESCRIPTION' && result.payload?.prescriptionId && (
                <a href={`/prestataire/mobile/tp/new?prescription=${result.payload.prescriptionId}`} className="btn-primary flex-1">Créer TP</a>
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
            placeholder="ORD-... / CARD-... / ENT-..."
            autoComplete="off"
            required
          />
          <button type="submit" className="btn-primary" disabled={processing}>Vérifier</button>
        </div>
      </form>

      {/* Historique récent */}
      <section className="space-y-2">
        <h3 className="font-semibold">Scans récents</h3>
        <p className="text-xs text-slate-500">L'historique sera affiché ici après implémentation du stockage local.</p>
      </section>
    </div>
  );
}