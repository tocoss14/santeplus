import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface Props {
  onDetected: (text: string) => void;
  onClose: () => void;
}

export default function QrScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);

  function stop() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra non supportée par ce navigateur');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        const tick = () => {
          try {
            if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR?.(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
              if (code?.data) {
                stop();
                onDetected(code.data.trim());
                return;
              }
            }
          } catch (e) {
            console.error('[QrScanner] frame error', e);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e: any) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Accès à la caméra refusé. Autorisez la caméra ou saisissez le jeton manuellement.'
            : e?.message ?? 'Impossible d’accéder à la caméra',
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden bg-slate-900">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted />
        <div className="absolute inset-8 border-4 border-brand-400/80 rounded-xl pointer-events-none" />
        <canvas ref={canvasRef} className="hidden" />
      </div>
      {error ? (
        <p className="mt-4 text-sm text-red-300 text-center max-w-md">{error}</p>
      ) : (
        <p className="mt-4 text-sm text-slate-200">Alignez le QR code de la carte assuré dans le cadre</p>
      )}
      <button onClick={() => { stop(); onClose(); }} className="btn-outline mt-6">
        ✕ Fermer
      </button>
    </div>
  );
}
