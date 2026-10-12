import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import InstallPrompt from '../components/InstallPrompt';
import CookieBanner from '../components/CookieBanner';

export default function PublicLayout() {
  const { me } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-brand-800">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white text-sm">SP</span>
            SantéPlus <span className="text-slate-600 hidden sm:inline text-sm font-medium">Bénin</span>
          </Link>
          {/* Palier md (768–1023) : les 5 liens + Connexion + Souscrire font 835 px
              de contenu pour 768 de vue → scroll horizontal. Le menu desktop ne
              s'ouvre donc qu'à lg ; entre les deux, le panneau Menu prend le relais. */}
          <nav className="hidden lg:flex items-center gap-1 text-sm font-medium text-slate-600">
            <NavLink to="/offres" className="rounded-lg px-3 py-2 hover:bg-slate-100">Nos formules</NavLink>
            <a href="/#fonctionnement" className="rounded-lg px-3 py-2 hover:bg-slate-100">Fonctionnement</a>
            <NavLink to="/reseau" className="rounded-lg px-3 py-2 hover:bg-slate-100">Réseau de soins</NavLink>
            <NavLink to="/cga" className="rounded-lg px-3 py-2 hover:bg-slate-100">Conditions Générales</NavLink>
            <a href="/#faq" className="rounded-lg px-3 py-2 hover:bg-slate-100">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-outline btn-sm min-h-[44px] lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="public-navigation"
              onClick={() => setMenuOpen(open => !open)}
            >
              Menu
            </button>
            {me ? (
              <Link to={homeFor(me.role)} className="btn-primary btn-sm min-h-[44px] lg:min-h-0">Mon espace</Link>
            ) : (
              <>
                {/* En mobile, « Connexion » vit dans le panneau Menu : avec les trois
                    boutons, la barre débordait de 43 px en 360 px (scroll horizontal
                    sur toute la page publique). */}
                <Link to="/login" className="btn-outline btn-sm hidden min-h-[44px] sm:inline-flex lg:min-h-0">Connexion</Link>
                <Link to="/offres" className="btn-primary btn-sm min-h-[44px] lg:min-h-0">Souscrire</Link>
              </>
            )}
          </div>
        </div>
        {menuOpen && (
          <nav id="public-navigation" className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden">
            {[
              { to: '/offres', label: 'Nos formules' },
              { to: '/reseau', label: 'Réseau de soins' },
              { to: '/cga', label: 'Conditions Générales' },
              { to: '/simulateur', label: 'Simulateur' },
            ].map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {item.label}
              </NavLink>
            ))}
            {!me && (
              <NavLink
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-bold text-brand-700 hover:bg-slate-100"
              >
                Connexion
              </NavLink>
            )}
          </nav>
        )}
      </header>
      <main className="flex-1 pb-28">
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
              <li><span className="text-slate-600">Offres entreprises</span></li>
              <li><Link className="hover:text-brand-700" to="/cga">Conditions Générales</Link></li>
              <li><Link className="hover:text-brand-700" to="/reseau">Réseau de soins</Link></li>
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
          <div className="md:col-span-1 text-xs text-slate-600">
            <p>SantéPlus est une plateforme technologique d’intermédiation. Les contrats sont portés par des assureurs et mutuelles partenaires agréés.</p>
            <p className="mt-2">© 2026 SantéPlus — Démonstration.</p>
          </div>
        </div>
      </footer>
      <InstallPrompt />
      <CookieBanner />
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
