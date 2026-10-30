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

function rawResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
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

describe('api client — message d’une réponse non JSON', () => {
  // Une route qui sert un fichier (attestation, export…) n'est pas une panne de
  // routage : le message doit orienter vers un téléchargement.
  async function messageOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (err) {
      return (err as Error).message;
    }
    throw new Error('la requête aurait dû échouer');
  }

  it('un PDF est signalé comme fichier à ouvrir autrement, pas comme un souci de routage', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(200, '%PDF-1.7', { 'content-type': 'application/pdf' }),
    );
    const message = await messageOf(api.get('/contracts/1/certificate'));
    expect(message).toMatch(/un PDF/);
    expect(message).toMatch(/window\.open/);
    expect(message).not.toMatch(/VITE_API_URL/);
  });

  it('reconnaît un PDF à sa signature quand le Content-Type manque', async () => {
    fetchMock.mockResolvedValueOnce(rawResponse(200, '%PDF-1.4'));
    expect(await messageOf(api.get('/company/me/attestation'))).toMatch(/un PDF/);
  });

  it('un export CSV est signalé comme fichier', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(200, 'date;montant\n2026-01-01;12000', { 'content-type': 'text/csv; charset=utf-8' }),
    );
    const message = await messageOf(api.get('/admin/accounting/export'));
    expect(message).toMatch(/fichier CSV/);
    expect(message).not.toMatch(/routage/);
  });

  it('une image est signalée comme fichier', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(200, '\u0000\u0000binary', { 'content-type': 'image/jpeg' }),
    );
    expect(await messageOf(api.get('/files/1/view'))).toMatch(/une image/);
  });

  it('une page HTML garde l’indice de routage /api', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(200, '<!DOCTYPE html><html><body>index</body></html>', {
        'content-type': 'text/html; charset=utf-8',
      }),
    );
    expect(await messageOf(api.get('/things'))).toMatch(/routage \/api/);
  });

  it('une page HTML en 500 dit que l’API a échoué, pas que le routage est en cause', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(500, '<html><body>Internal Server Error</body></html>', {
        'content-type': 'text/html',
      }),
    );
    const message = await messageOf(api.get('/things'));
    expect(message).toMatch(/Erreur serveur/);
    expect(message).toMatch(/statut 500/);
    expect(message).not.toMatch(/routage/);
    expect(message).not.toMatch(/VITE_API_URL/);
  });

  it('un 503 dit que l’API est indisponible plutôt que mal routée', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(503, '<html><body>Service Unavailable</body></html>', {
        'content-type': 'text/html',
      }),
    );
    const message = await messageOf(api.get('/things'));
    expect(message).toMatch(/API indisponible/);
    expect(message).not.toMatch(/routage/);
  });

  it('un 404 HTML garde l’indice de routage (fallback SPA)', async () => {
    fetchMock.mockResolvedValueOnce(
      rawResponse(404, '<!DOCTYPE html><html></html>', { 'content-type': 'text/html' }),
    );
    expect(await messageOf(api.get('/things'))).toMatch(/routage \/api/);
  });

  it('du texte brut est distingué d’une panne de routage', async () => {
    fetchMock.mockResolvedValueOnce(rawResponse(200, 'OK', { 'content-type': 'text/plain' }));
    const message = await messageOf(api.get('/things'));
    expect(message).toMatch(/texte brut/);
    expect(message).not.toMatch(/routage/);
  });
});
