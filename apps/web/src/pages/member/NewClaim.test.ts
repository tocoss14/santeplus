import { describe, expect, it } from 'vitest';
import { claimDocumentTypes } from './NewClaim';

describe('claimDocumentTypes', () => {
  it('marks the first uploaded file with the selected type', () => {
    expect(claimDocumentTypes(3, 'PRESCRIPTION')).toEqual(['PRESCRIPTION', 'OTHER', 'OTHER']);
  });

  it('returns no document types without files', () => {
    expect(claimDocumentTypes(0, 'INVOICE')).toEqual([]);
  });
});
