/* Le front de production (Vercel) appelle l'API derrière son proxy /api : Vercel
   réécrit le Host vers l'hôte Render, donc l'Origin du navigateur n'est jamais
   égal au Host de la requête côté API. Sans entrée explicite dans webOrigin (ou
   un motif d'hôte autorisé), la garde anti-CSRF de main.ts refuse toute mutation
   authentifiée par cookie (souscription, paiement, sinistre) en 403 « Origine
   non autorisée ».
   Les déploiements de préversion portent un hôte différent à chaque build
   (`santeplus-<id>-elzeds-projects.vercel.app`) : d'où les motifs. */
import { describe, expect, it } from 'vitest';
import { config } from '../src/config';

const matchesPattern = (host: string) => config.frontOriginPatterns.some(re => re.test(host));

describe('origines du front autorisées', () => {
  it('liste le front de production Vercel en plus de WEB_ORIGIN', () => {
    const origins = config.webOrigin.split(',').map(o => o.trim()).filter(Boolean);
    expect(origins).toContain('https://santeplus-sigma.vercel.app');
  });

  it("ne modifie pas les liens d'e-mail, dérivés de WEB_ORIGIN (webPublicUrl)", () => {
    expect(config.webPublicUrl).not.toContain('vercel.app');
  });

  it('accepte les déploiements de préversion et de branche de l’équipe', () => {
    expect(matchesPattern('santeplus-flz1horlo-elzeds-projects.vercel.app')).toBe(true);
    expect(matchesPattern('santeplus-git-master-elzeds-projects.vercel.app')).toBe(true);
  });

  it('refuse tout hôte qui n’est pas un déploiement de l’équipe', () => {
    expect(matchesPattern('santeplus-sigma.vercel.app')).toBe(false);
    expect(matchesPattern('autre-projet.vercel.app')).toBe(false);
    expect(matchesPattern('evil-elzeds-projects.vercel.app.attaquant.test')).toBe(false);
    expect(matchesPattern('elzeds-projects.vercel.app.attaquant.test')).toBe(false);
  });
});
