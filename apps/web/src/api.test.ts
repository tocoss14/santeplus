import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, onApiError, resolveApiBase } from './api';

// Mock global fetch — chaque test configure son comportement.
const fetchMock = vi.fn();
// @ts-ignore
global.fetch = fetchMock;

function jsonResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api base resolution', () => {
  it('prefers an explicitly configured API URL', () => {
    expect(resolveApiBase('https://api.example.com/', 'santeplus.runsite.site')).toBe(
      'https://api.example.com',
    );
  });

  it('maps a Runsite static hostname to its companion API service', () => {
    expect(resolveApiBase(undefined, 'santeplus.runsite.site', 'https:')).toBe(
      'https://santeplus.runsite.app',
    );
  });

  it('keeps same-origin routing outside Runsite static hosting', () => {
    expect(resolveApiBase(undefined, 'app.santeplus.bj', 'https:')).toBe('');
  });
});

describe('api client — silent failure regression tests', () => {
  it('non-JSON (HTML) response throws an explicit ApiError, never swallows', async () => {
    // Exact failure mode of the Runsite SPA fallback: /api/* answered with index.html
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<!DOCTYPE html><html><body>index.html</body></html>',
    });

    await expect(api.get('/things')).rejects.toBeInstanceOf(ApiError);
    await expect(api.get('/things')).rejects.toThrow(/non JSON/);
  });

  it('network failure (fetch throws) wraps into ApiError instead of TypeError leaking', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.get('/things')).rejects.toMatchObject({ status: 0 });
  });

  it('HTTP error status throws ApiError with server message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { message: 'Montant invalide' }));
    await expect(api.post('/things', {})).rejects.toMatchObject({
      status: 422,
      message: 'Montant invalide',
    });
  });

  it('GET errors are emitted to onApiError listeners (global toast path)', async () => {
    const listener = vi.fn();
    const unsub = onApiError(listener);
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'Boom' }));

    await expect(api.get('/things')).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ status: 500, message: 'Boom' });
    unsub();
  });

  it('POST errors are NOT emitted (forms show inline errors themselves)', async () => {
    const listener = vi.fn();
    const unsub = onApiError(listener);
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: 'Champ requis' }));

    await expect(api.post('/things', {})).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('401 after failed refresh is NOT emitted (auth flow owns it)', async () => {
    const listener = vi.fn();
    const unsub = onApiError(listener);
    // First call: /auth/me returns 401; refresh call also fails.
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => '' })
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => '' });

    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('204 returns undefined without parsing', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
    expect(await api.del('/things/1')).toBeUndefined();
  });

  it('successful GET emits nothing', async () => {
    const listener = vi.fn();
    const unsub = onApiError(listener);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { hello: 'world' }));
    expect(await api.get('/things')).toEqual({ hello: 'world' });
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });
});
