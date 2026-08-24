import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

export default function PublicLayout() {
  const { me } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-brand-800">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white text-sm">SP</span>
            SantéPlus <span className="text-slate-400 hidden sm:inline text-sm font-medium">Bénin</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-600">
            <NavLink to="/offres" className="rounded-lg px-3 py-2 hover:bg-slate-100">Nos formules</NavLink>
            <a href="/#fonctionnement" className="rounded-lg px-3 py-2 hover:bg-slate-100">Fonctionnement</a>
            <a href="/#reseau" className="rounded-lg px-3 py-2 hover:bg-slate-100">Réseau de soins</a>
            <a href="/#faq" className="rounded-lg px-3 py-2 hover:bg-slate-100">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {me ? (
              <Link to={homeFor(me.role)} className="btn-primary btn-sm">Mon espace</Link>
            ) : (
              <>
                <Link to="/login" className="btn-outline btn-sm">Connexion</Link>
                <Link to="/offres" className="btn-primary btn-sm">Souscrire</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <p className="font-bold text-brand-800">SantéPlus Bénin</p>
            <p className="mt-2 text-slate-500">Votre santé. Votre couverture. Simplement.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-700">Produits</p>
            <ul className="mt-2 space-y-1.5 text-slate-500">
              <li><Link className="hover:text-brand-700" to="/offres">Formules individuelles</Link></li>
              <li><span className="text-slate-400">Offres entreprises</span></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-700">Aide</p>
            <ul className="mt-2 space-y-1.5 text-slate-500">
              <li>support@santeplus.bj</li>
              <li>+229 (0) 01 00 00 00</li>
              <li>Cotonou, Bénin</li>
            </ul>
          </div>
          <div className="md:col-span-1 text-xs text-slate-400">
            <p>SantéPlus est une plateforme technologique d’intermédiation. Les contrats sont portés par des assureurs et mutuelles partenaires agréés.</p>
            <p className="mt-2">© 2026 SantéPlus — Démonstration.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function homeFor(role: string): string {  const map: Record<string, string> = {
    MEMBER: '/app',
    COMPANY_ADMIN: '/entreprise',
    SUPER_ADMIN: '/admin',
    INSURANCE_MANAGER: '/admin',
    SUPPORT_AGENT: '/admin/claims',
    PROVIDER: '/prestataire',
  };
  return map[role] ?? '/';
}
