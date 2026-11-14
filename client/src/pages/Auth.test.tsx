import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthPage } from './Auth';

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: auth.user, signIn: vi.fn() }) }));
vi.mock('../components/GoogleSignIn', () => ({ GoogleSignIn: () => <div>Google button</div> }));

const page = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthPage mocking={false} />
    </MemoryRouter>,
  );
afterEach(() => {
  cleanup();
  auth.user = null;
});

describe('Sign-in page', () => {
  it('offers email and Google sign-in together', () => {
    page();
    expect(screen.getByRole('heading', { name: 'Sign in to Recall' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText('Google button')).toBeTruthy();
  });
  it('switches between sign in and create account, clearing the form', () => {
    page();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'typed@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create your Recall account' })).toBeTruthy();
    expect(screen.getByLabelText('Name (optional)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in to Recall' })).toBeTruthy();
    expect(screen.queryByLabelText('Name (optional)')).toBeNull();
  });
  it('sends a signed-in user away from the sign-in page', () => {
    auth.user = { id: 'u1' };
    page();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });
});
