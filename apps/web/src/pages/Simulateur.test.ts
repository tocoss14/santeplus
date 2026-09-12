import { describe, expect, it } from 'vitest';
import { resolveSimulateProductId } from './Simulateur';

describe('resolveSimulateProductId', () => {
  it('uses the product selected by the user', () => {
    expect(resolveSimulateProductId('selected', [{ id: 'first' }])).toBe('selected');
  });

  it('falls back to the displayed first product when state is still empty', () => {
    expect(resolveSimulateProductId('', [{ id: 'first' }, { id: 'second' }])).toBe('first');
  });

  it('returns an empty value when no product is available', () => {
    expect(resolveSimulateProductId('', [])).toBe('');
  });
});
