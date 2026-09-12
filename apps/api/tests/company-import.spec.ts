import { describe, expect, it, vi } from 'vitest';
import {
  CompanyService,
  detectImportDelimiter,
  normalizeImportHeader,
} from '../src/modules/company/company.controller';

function makeService() {
  const prisma: any = {
    company: { findUnique: vi.fn(async () => ({ id: 'company-1', status: 'ACTIVE' })) },
    user: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
    },
  };
  const service = new CompanyService(prisma) as any;
  service.createEmployee = vi.fn(async () => ({ userId: 'user-1', tempPassword: 'temp-1' }));
  return { service, createEmployee: service.createEmployee };
}

describe('company CSV compatibility', () => {
  it('normalizes documented headers and detects both delimiters', () => {
    expect(normalizeImportHeader('DateNaissance')).toBe('DATENAISSANCE');
    expect(normalizeImportHeader('Date Naissance')).toBe('DATENAISSANCE');
    expect(normalizeImportHeader('Téléphone')).toBe('TELEPHONE');
    expect(detectImportDelimiter('a;b\nc;d')).toBe(';');
    expect(detectImportDelimiter('a,b\nc,d')).toBe(',');
  });

  it('imports the documented semicolon template', async () => {
    const { service, createEmployee } = makeService();
    const csv = [
      'Nom;Prénom;DateNaissance;Téléphone;Email;Fonction;Ayants droit;Statut',
      'DOSSA;Paul;12/03/1991;+229 97 44 55 01;paul.dossa@exemple.bj;Chauffeur;Conjoint:DOSSA Alice,04/07/1993|Enfant:DOSSA Marc,10/10/2015;ACTIF',
    ].join('\n');
    const result = await service.importEmployees({ companyId: 'company-1' }, csv);

    expect(result).toMatchObject({ imported: 1, errors: [] });
    expect(createEmployee).toHaveBeenCalledWith('company-1', expect.objectContaining({
      firstName: 'Paul',
      lastName: 'DOSSA',
      email: 'paul.dossa@exemple.bj',
      beneficiaries: [
        expect.objectContaining({ firstName: 'Alice', lastName: 'DOSSA', relation: 'SPOUSE' }),
        expect.objectContaining({ firstName: 'Marc', lastName: 'DOSSA', relation: 'CHILD' }),
      ],
    }));
  });

  it('imports the comma format used by automated tests', async () => {
    const { service, createEmployee } = makeService();
    const csv = [
      'NOM,PRENOM,EMAIL,TELEPHONE,DATENAISSANCE,FONCTION',
      'Doe,John,john@example.bj,+22997000001,15/06/1990,Chauffeur',
    ].join('\n');
    const result = await service.importEmployees({ companyId: 'company-1' }, csv);

    expect(result).toMatchObject({ imported: 1, errors: [] });
    expect(createEmployee).toHaveBeenCalledWith('company-1', expect.objectContaining({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.bj',
    }));
  });
});
