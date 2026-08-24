import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_HOME, useAuth } from '../auth';

interface Item {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const MENUS: Record<string, { items: Item[] }> = {
  member: {
    items: [
      { to: '/app', label: 'Accueil', icon: '🏠', end: true },
      { to: '/app/contrat', label: 'Mon contrat', icon: '📄' },
      { to: '/app/carte', label: 'Carte', icon: '🪪' },
      { to: '/app/remboursements', label: 'Remboursements', icon: '💊' },
      { to: '/app/prestataires', label: 'Réseau', icon: '🏥' },
      { to: '/app/beneficiaires', label: 'Ayants droit', icon: '👨‍👩‍👧' },
      { to: '/app/profil', label: 'Profil', icon: '⚙️' },
    ],
  },
  company: {
    items: [
      { to: '/entreprise', label: 'Tableau de bord', icon: '📊', end: true },
      { to: '/entreprise/salaries', label: 'Salariés', icon: '👥' },
      { to: '/entreprise/contrat', label: 'Contrat collectif', icon: '📄' },
      { to: '/entreprise/profil', label: 'Profil', icon: '⚙️' },
    ],
  },
  admin: {
    items: [
      { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
      { to: '/admin/claims', label: 'Remboursements', icon: '🧾' },
      { to: '/admin/contracts', label: 'Contrats', icon: '📄' },
      { to: '/admin/users', label: 'Assurés & utilisateurs', icon: '👤' },
      { to: '/admin/products', label: 'Produits', icon: '📦' },
      { to: '/admin/payments', label: 'Paiements', icon: '💳' },
      { to: '/admin/providers', label: 'Prestataires', icon: '🏥' },
      { to: '/admin/partners', label: 'Partenaires', icon: '🤝' },
      { to: '/admin/roles', label: 'Rôles & permissions', icon: '🔐' },
      { to: '/admin/audit', label: "Journal d'audit", icon: '📜' },
      { to: '/admin/profil', label: 'Profil', icon: '⚙️' },
    ],
  },
  provider: {
    items: [{ to: '/prestataire', label: 'Vérification carte', icon: '📷', end: true }],
  },
};

export default function AppLayout({ variant = 'member' }: { variant?: string }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const menu = MENUS[variant] ?? MENUS.member;

  const doLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white">
        <NavLink to="/" className="flex items-center gap-2 px-5 h-16 border-b border-slate-200 font-bold text-brand-800">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white text-sm">SP</span>
          SantéPlus
        </NavLink>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {menu.items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <p className="truncate text-sm font-semibold text-slate-700">{me?.firstName} {me?.lastName}</p>
          <p className="truncate text-xs text-slate-400">{me?.email}</p>
          <button onClick={doLogout} className="mt-3 text-xs font-semibold text-red-600 hover:text-red-700">Se déconnecter</button>
        </div>
      </aside>

      <div className="flex-1 pb-20 lg:pb-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur px-4">
          <div className="flex items-center gap-2 font-semibold text-slate-700 lg:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white text-xs">SP</span>
            SantéPlus
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            {(variant === 'member' || variant === 'company') && (
              <NavLink to={`${variant === 'member' ? '/app' : '/entreprise'}/notifications`} className="relative rounded-full p-2 hover:bg-slate-100" title="Notifications">
                🔔
                {(me?.unreadNotifications ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {me!.unreadNotifications}
                  </span>
                )}
              </NavLink>
            )}
            <button onClick={doLogout} className="text-xs font-semibold text-slate-500 hover:text-red-600">Quitter</button>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">
          <Outlet />
        </main>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-slate-200 bg-white">
          {menu.items.slice(0, 5).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${isActive ? 'text-brand-700' : 'text-slate-400'}`
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

export { ROLE_HOME };
