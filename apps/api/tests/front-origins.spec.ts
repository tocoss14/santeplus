/* Le front de production (Vercel) appelle l'API derrière son proxy /api : Vercel
   réécrit le Host vers l'hôte Render, donc l'Origin du navigateur n'est jamais
   égal au Host de la requête côté API. Sans entrée explicite dans webOrigin, la
   garde anti-CSRF de main.ts refuse toute mutation authentifiée par cookie
   (souscription, paiement, sinistre) en 403 « Origine non autorisée ». */
import { describe, expect, it } from 'vitest';
import { config } from '../src/config';

describe('origines du front autorisées', () => {
  it('liste le front de production Vercel en plus de WEB_ORIGIN', () => {
    const origins = config.webOrigin.split(',').map(o => o.trim()).filter(Boolean);
    expect(origins).toContain('https://santeplus-sigma.vercel.app');
  });

  it("ne modifie pas les liens d'e-mail, dérivés de WEB_ORIGIN (webPublicUrl)", () => {
    expect(config.webPublicUrl).not.toContain('vercel.app');
  });
});
