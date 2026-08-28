import { describe, expect, it } from 'vitest';
import { needsPriorAuthorization, resolveThreshold } from '../src/domain/engine';

describe('resolveThreshold', () => {
  it('most restrictive wins (both defined)', () => {
    expect(resolveThreshold(200000, 100000)).toBe(100000);
  });
  it('only act defined', () => {
    expect(resolveThreshold(null, 100000)).toBe(100000);
  });
  it('only product defined', () => {
    expect(resolveThreshold(200000, null)).toBe(200000);
  });
  it('fallback global when both null', () => {
    expect(resolveThreshold(null, null)).toBe(150000);
  });
  it('undefined also falls back', () => {
    expect(resolveThreshold(undefined, undefined)).toBe(150000);
  });
  it('zero or negative ignored', () => {
    expect(resolveThreshold(0, 100000)).toBe(100000);
    expect(resolveThreshold(-5, null)).toBe(150000);
  });
});

describe('threshold integration - per-item AUTH_REQUIRED', () => {
  it('claim with one item actThreshold 50000, covered 60000 -> AUTH_REQUIRED even if product threshold 200000', () => {
    const threshold = resolveThreshold(200000, 50000);
    expect(threshold).toBe(50000);
    expect(needsPriorAuthorization(60000, threshold)).toBe(true);
  });
  it('claim below threshold does not require auth', () => {
    const threshold = resolveThreshold(200000, 50000);
    expect(needsPriorAuthorization(40000, threshold)).toBe(false);
  });
  it('multi-item: if ANY item exceeds its own threshold, whole claim needs auth', () => {
    const productThreshold = 200000;
    // item0: act 50000, approved 60000 -> exceeds
    // item1: act 200000, approved 10000 -> ok
    const t0 = resolveThreshold(productThreshold, 50000);
    const t1 = resolveThreshold(productThreshold, 200000);
    const item0Needs = needsPriorAuthorization(60000, t0);
    const item1Needs = needsPriorAuthorization(10000, t1);
    const claimNeedsAuth = item0Needs || item1Needs;
    expect(claimNeedsAuth).toBe(true);
  });
});
