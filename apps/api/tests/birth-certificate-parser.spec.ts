import { describe, expect, it } from 'vitest';
import { parseBirthCertificateText, parseFrenchDate, stripAccents } from '../src/modules/subscription/birth-certificate-parser';

describe('parseFrenchDate', () => {
  it('lit les dates littérales françaises', () => {
    expect(parseFrenchDate('12 janvier 1990')?.toISOString()).toBe('1990-01-12T00:00:00.000Z');
    expect(parseFrenchDate('1er février 2001')?.toISOString()).toBe('2001-02-01T00:00:00.000Z');
    expect(parseFrenchDate('né le 3 sept. 1985')?.toISOString()).toBe('1985-09-03T00:00:00.000Z');
  });

  it('lit les formats numériques et ISO', () => {
    expect(parseFrenchDate('12/01/1990')?.toISOString()).toBe('1990-01-12T00:00:00.000Z');
    expect(parseFrenchDate('12.01.1990')?.toISOString()).toBe('1990-01-12T00:00:00.000Z');
    expect(parseFrenchDate('1990-01-12')?.toISOString()).toBe('1990-01-12T00:00:00.000Z');
  });

  it('rejette les dates invalides ou invraisemblables', () => {
    expect(parseFrenchDate('32 janvier 1990')).toBeUndefined();
    expect(parseFrenchDate('12 janvier 1800')).toBeUndefined();
    expect(parseFrenchDate('')).toBeUndefined();
  });
});

describe('parseBirthCertificateText', () => {
  it('extrait un acte bien structuré', () => {
    const text = [
      'RÉPUBLIQUE DU BÉNIN',
      'EXTRAIT D’ACTE DE NAISSANCE',
      'N° acte: 1234/C/1990',
      'Prénom : Marie-Josée',
      'Nom: ADJOVI',
      'Né(e) le : 12 janvier 1990',
      'Né(e) à: Cotonou, Littoral',
      'Fils de : KOFFI Jean  et de  ADJOVI Marie',
    ].join('\n');
    const r = parseBirthCertificateText(text);
    expect(r.firstName).toBe('Marie-Josée');
    expect(r.lastName).toBe('ADJOVI');
    expect(r.birthDate?.toISOString()).toBe('1990-01-12T00:00:00.000Z');
    expect(r.birthPlace).toBe('Cotonou');
    expect(r.documentNumber).toBe('1234/C/1990');
    expect(r.parents).toContain('KOFFI Jean');
  });

  it('résiste aux étiquettes mal ponctuées par l’OCR (deux-points remplacés)', () => {
    const text = 'Prénom Jean\nNom KPODEKON\nNe le 05.03.1978';
    const r = parseBirthCertificateText(text);
    expect(r.firstName).toBe('Jean');
    expect(r.lastName).toBe('KPODEKON');
    expect(r.birthDate?.toISOString()).toBe('1978-03-05T00:00:00.000Z');
  });

  it('gère la ligne combinée « NOM Prénom » (fallback structurel)', () => {
    const text = 'NOM DOSSOU Pierre\nNé le 21 juin 1995';
    const r = parseBirthCertificateText(text);
    expect(r.lastName).toBe('DOSSOU');
    expect(r.firstName).toBe('Pierre');
  });

  it('extrait prénom et nom depuis des étiquettes distinctes', () => {
    const text = 'Prénom : Ana\nNom de famille : GOMEZ\nDate de naissance : 02/02/2002';
    const r = parseBirthCertificateText(text);
    expect(r.firstName).toBe('Ana');
    expect(r.lastName).toBe('GOMEZ');
  });

  it('texte vide ou illisible → champs absents (pas de crash)', () => {
    const r = parseBirthCertificateText('');
    expect(r.firstName).toBeUndefined();
    expect(r.birthDate).toBeUndefined();
    const r2 = parseBirthCertificateText('?????? #### ###');
    expect(r2.firstName).toBeUndefined();
  });

  it('préfère la première occurrence (pas d’écrasement par le registre)', () => {
    const text = 'Nom : TESTUN\nPrénom : Un\nNom du père : TESTDEUX\nPrénom du père : Deux';
    const r = parseBirthCertificateText(text);
    expect(r.lastName).toBe('TESTUN');
    expect(r.firstName).toBe('Un');
  });
});

describe('stripAccents (utilitaire de normalisation)', () => {
  it('supprime les accents', () => {
    expect(stripAccents('Éèêë')).toBe('Eeee');
  });
});
