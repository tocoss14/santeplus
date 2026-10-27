import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildProductPayload, ProductEditor } from './AdminProducts';

/**
 * P12 — l'écran d'administration des formules doit piloter la grille que le
 * moteur applique réellement : composition incluse dans le forfait, suppléments
 * par personne au-delà, et surprime du rachat de carence hospitalisation.
 * Sans ces trois champs, une formule familiale ne pouvait être corrigée que par
 * migration SQL.
 */

const produitFamille = {
  id: 'p-fam',
  code: 'FAM',
  name: 'Santé Famille',
  description: 'Forfait familial',
  clientType: 'INDIVIDUAL',
  minAge: 0,
  maxAge: 65,
  basePremiumAnnual: 75000,
  includedAdults: 2,
  includedChildren: 3,
  pricePerAdditionalAdultAnnual: 30000,
  pricePerChildAnnual: 18000,
  carenceBuyoutRate: 25,
  waitingPeriodDays: 30,
  globalAnnualCap: 3000000,
  oopAnnualCap: '',
  status: 'ACTIVE',
  sortOrder: 3,
  thirdPartyAuthThreshold: '',
  spouse: true,
  childMaxAge: 21,
  otherAllowed: true,
  maxBeneficiaries: 10,
  guarantees: [],
  exclusionsText: '',
};

describe('buildProductPayload', () => {
  it('transmet les inclusions du forfait et la surprime de rachat', () => {
    const p = buildProductPayload(produitFamille);
    expect(p).toMatchObject({
      includedAdults: 2,
      includedChildren: 3,
      pricePerAdditionalAdultAnnual: 30000,
      pricePerChildAnnual: 18000,
      carenceBuyoutRate: 25,
    });
  });

  it('convertit les saisies texte du formulaire en nombres', () => {
    const p = buildProductPayload({
      ...produitFamille,
      includedAdults: '4',
      includedChildren: '5',
      carenceBuyoutRate: '40',
    });
    expect(p.includedAdults).toBe(4);
    expect(p.includedChildren).toBe(5);
    expect(p.carenceBuyoutRate).toBe(40);
  });

  it('replie sur les défauts neutres quand les champs sont absents', () => {
    const p = buildProductPayload({ ...produitFamille, includedAdults: undefined, includedChildren: undefined, carenceBuyoutRate: undefined });
    expect(p).toMatchObject({ includedAdults: 1, includedChildren: 0, carenceBuyoutRate: 0 });
  });
});

describe('ProductEditor', () => {
  it('expose les trois champs en saisie, garnis des valeurs du produit', () => {
    const html = renderToString(
      <ProductEditor product={produitFamille} partners={[]} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(html).toContain('Adultes inclus (forfait)');
    expect(html).toContain('Enfants inclus (forfait)');
    expect(html).toContain('Rachat de carence (surprime %)');
    expect(html).toContain('value="2"');
    expect(html).toContain('value="3"');
    expect(html).toContain('value="25"');
    // Les suppléments par personne restent éditables sur le même écran.
    expect(html).toContain('Adulte supp./an');
    expect(html).toContain('value="30000"');
    expect(html).toContain('value="18000"');
  });

  it('affiche les défauts neutres sur un produit sans forfait', () => {
    const html = renderToString(
      <ProductEditor
        product={{ ...produitFamille, includedAdults: 1, includedChildren: 0, carenceBuyoutRate: 0, guarantees: [] }}
        partners={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(html).toContain('Rachat de carence (surprime %)');
    expect(html).toContain('0 = option non proposée');
  });
});
