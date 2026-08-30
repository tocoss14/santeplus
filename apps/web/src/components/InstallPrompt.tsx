import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa-dismiss') === '1');

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // iOS does not fire beforeinstallprompt — show manual hint after 3s if standalone false
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = (window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone;
    if (isIOS && !isStandalone && !dismissed) {
      setTimeout(() => setDeferred({} as any), 3000);
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  if (!deferred || dismissed) return null;
  const isIOSPrompt = !(deferred as any).prompt;

  const install = async () => {
    if ((deferred as any).prompt) {
      await (deferred as any).prompt();
      const choice = await (deferred as any).userChoice;
      if (choice.outcome === 'accepted') setDeferred(null);
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-2xl border border-mist bg-white p-4 shadow-[0_12px_32px_rgba(15,30,46,.15)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[360px]">
      <div className="flex gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white">📲</div>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink">Installer SantéPlus</p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone">
            {isIOSPrompt ? 'Appuyez sur Partager → Sur l\'écran d\'accueil pour un accès instantané, même hors ligne.' : 'Accès instantané, hors ligne et notifications — sans passer par le store.'}
          </p>
        </div>
        <button onClick={() => { setDismissed(true); localStorage.setItem('pwa-dismiss', '1'); }} className="h-7 w-7 shrink-0 rounded-full bg-slate-100 text-slate-500">✕</button>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => { setDismissed(true); localStorage.setItem('pwa-dismiss', '1'); }} className="btn-outline flex-1 btn-sm">Plus tard</button>
        {!isIOSPrompt && <button onClick={install} className="btn-primary flex-1 btn-sm">Installer</button>}
      </div>
    </div>
  );
}
