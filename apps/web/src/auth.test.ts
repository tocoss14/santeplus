import { describe, expect, it } from 'vitest';
import { postAuthTarget } from './auth';

describe('postAuthTarget', () => {
  it('preserves a safe post-login destination', () => {
    expect(postAuthTarget('MEMBER', '/app/souscrire?productId=product-1')).toBe(
      '/app/souscrire?productId=product-1',
    );
  });

  it('falls back to the role home page', () => {
    expect(postAuthTarget('MEMBER', null)).toBe('/app');
  });

  it('rejects external redirect destinations', () => {
    expect(postAuthTarget('MEMBER', 'https://example.com/evil')).toBe('/app');
  });
});
