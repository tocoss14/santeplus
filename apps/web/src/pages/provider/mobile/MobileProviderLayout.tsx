import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function MobileProviderLayout() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const location = useLocation();

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const navItems = [
    { to: '/prestataire/mobile', label: 'Accueil', icon: '🏠' },
    { to: '/prestataire/mobile/scan', label: 'Scanner', icon: '📷' },
    { to: '/prestataire/mobile/tp', label: 'Tiers payant', icon: '💊' },
    { to: '/prestataire/mobile/factures', label: 'Factures', icon: '📄' },
    { to: '/prestataire/mobile/rejets', label: 'Rejets', icon: '⚠️' },
    { to: '/prestataire/mobile/sync', label: 'Sync', icon: '🔄' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header mobile */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-bold text-brand-800 text-lg">SantéPlus Pro</h1>
          {installPrompt && (
            <button onClick={handleInstall} className="btn-primary btn-sm text-xs">
              Installer
            </button>
          )}
        </div>
        {/* Navigation tabs */}
        <nav className="flex border-t border-slate-100 bg-white px-2 pb-2" role="tablist">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition ${
                  isActive
                    ? 'text-brand-700 bg-brand-50'
                    : 'text-slate-500'
                }`
              }
              role="tab"
              aria-current={location.pathname === item.to ? 'page' : undefined}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Safe area for bottom nav */}
      <main className="pt-28 pb-24 min-h-screen">
        <Outlet />
      </main>

      {/* Install prompt banner (iOS) */}
      {installPrompt && (
        <div className="fixed bottom-24 left-4 right-4 z-50 bg-brand-600 text-white p-4 rounded-xl shadow-lg animate-slide-up">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Installer l'application</p>
              <p className="text-xs opacity-90">Accès hors-ligne, scan QR rapide</p>
            </div>
            <button onClick={handleInstall} className="btn bg-white text-brand-700 btn-sm">Installer</button>
          </div>
        </div>
      )}
    </div>
  );
}