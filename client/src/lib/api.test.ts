import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, getToken, setToken } from './api';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reader@example.com',
  name: null,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const invalid = { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };

let fetchMock: ReturnType<typeof vi.fn>;
let unauthorized: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  unauthorized = vi.fn();
  window.addEventListener('recall:unauthorized', unauthorized);
});
afterEach(() => {
  window.removeEventListener('recall:unauthorized', unauthorized);
  vi.unstubAllGlobals();
  setToken(null);
});

describe('auth API', () => {
  it('posts login details as JSON and returns the session', async () => {
    fetchMock.mockResolvedValue(json(200, { token: 'abc', user }));
    const result = await api.login({ email: ' reader@example.com ', password: 'password123' });
    expect(result).toEqual({ token: 'abc', user });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/auth\/login$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'reader@example.com', password: 'password123' });
  });
  it('posts registration details', async () => {
    fetchMock.mockResolvedValue(json(201, { token: 'abc', user }));
    await api.register({ email: 'reader@example.com', password: 'password123', name: 'Reader' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/auth\/register$/);
    expect(JSON.parse(init.body)).toEqual({
      email: 'reader@example.com',
      password: 'password123',
      name: 'Reader',
    });
  });
  it('does not send a request for invalid input', async () => {
    expect(() => api.register({ email: 'reader@example.com', password: 'short' })).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('treats a wrong password as a form error, not an expired session', async () => {
    setToken('existing-session');
    fetchMock.mockResolvedValue(json(401, invalid));
    const error = await api.login({ email: 'reader@example.com', password: 'nope' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Invalid email or password');
    expect((error as ApiError).status).toBe(401);
    expect(unauthorized).not.toHaveBeenCalled();
    expect(getToken()).toBe('existing-session');
  });
  it('still signs out when an authenticated request returns 401', async () => {
    setToken('expired-session');
    fetchMock.mockResolvedValue(
      json(401, { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
    );
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
  });
  it('passes the duplicate-email message through', async () => {
    fetchMock.mockResolvedValue(
      json(409, { error: { code: 'CONFLICT', message: 'Email already registered' } }),
    );
    await expect(api.register({ email: 'reader@example.com', password: 'password123' })).rejects.toThrow(
      'Email already registered',
    );
  });
});
