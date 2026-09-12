import { describe, expect, it } from 'vitest';
import { resolveQrVerifyPayload } from './MobileScanPage';

describe('resolveQrVerifyPayload', () => {
  it('understands JSON card payloads', () => {
    expect(resolveQrVerifyPayload('{"t":"tok_1234567890"}')).toEqual({ cardToken: 'tok_1234567890' });
  });

  it('understands contract and member numbers', () => {
    expect(resolveQrVerifyPayload('CTR-2026-0001')).toEqual({ contractNumber: 'CTR-2026-0001' });
    expect(resolveQrVerifyPayload('MEM-A00001')).toEqual({ memberNumber: 'MEM-A00001' });
  });

  it('treats long opaque values as card tokens', () => {
    expect(resolveQrVerifyPayload('tok_1234567890')).toEqual({ cardToken: 'tok_1234567890' });
  });
});
