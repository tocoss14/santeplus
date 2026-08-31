import { useEffect, useState } from 'react';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('cookie-consent')) setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur p-4">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-slate-600">
          Nous utilisons des cookies essentiels et des mesures d’audience anonymes pour améliorer SantéPlus. Aucune donnée médicale n’est partagée. <a href="/cga" className="font-semibold text-brand-700 hover:underline">En savoir plus</a>
        </p>
        <div className="flex gap-2">
          <button onClick={() => { localStorage.setItem('cookie-consent', 'denied'); setVisible(false); }} className="btn-outline btn-sm">Refuser</button>
          <button onClick={() => { localStorage.setItem('cookie-consent', 'accepted'); setVisible(false); }} className="btn-primary btn-sm">Accepter</button>
        </div>
      </div>
    </div>
  );
}
