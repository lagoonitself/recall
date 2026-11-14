import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GoogleSignIn } from './GoogleSignIn';

const mocks = vi.hoisted(() => ({ config: vi.fn(), google: vi.fn(), signIn: vi.fn(), navigate: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { config: mocks.config, google: mocks.google } }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ signIn: mocks.signIn }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  document.querySelector('script[src="https://accounts.google.com/gsi/client"]')?.remove();
  delete window.google;
});

describe('Google sign-in', () => {
  it('explains when Google sign-in is not configured', async () => {
    mocks.config.mockResolvedValue({ googleClientId: null });
    render(<GoogleSignIn mocking={false} />);
    expect(await screen.findByText('Google sign-in is not configured.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue (mock)' })).toBeNull();
  });
  it('retries a failed config request', async () => {
    mocks.config.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ googleClientId: null });
    render(<GoogleSignIn mocking={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Google sign-in is not configured.')).toBeTruthy();
    expect(mocks.config).toHaveBeenCalledTimes(2);
  });
  it('shows the mock action only when mocking and posts a credential', async () => {
    mocks.config.mockResolvedValue({ googleClientId: 'fake-client-id' });
    const response = { token: 'mock-token', user: {} };
    mocks.google.mockResolvedValue(response);
    render(<GoogleSignIn mocking />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue (mock)' }));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith(response));
    expect(mocks.google).toHaveBeenCalledWith('mock-google-credential');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
  it('does not offer mock sign-in without an active worker', async () => {
    mocks.config.mockResolvedValue({ googleClientId: 'real-client-id' });
    render(<GoogleSignIn mocking={false} />);
    await waitFor(() => expect(document.querySelector('.google-button')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Continue (mock)' })).toBeNull();
  });
});
