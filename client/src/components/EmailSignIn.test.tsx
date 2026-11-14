import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailSignIn } from './EmailSignIn';

const mocks = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), signIn: vi.fn(), navigate: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { login: mocks.login, register: mocks.register } }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ signIn: mocks.signIn }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

const response = { token: 'token', user: { id: 'u1' } };
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('Email sign-in', () => {
  it('shows email and password but no name field', () => {
    render(<EmailSignIn register={false} />);
    expect(screen.getByLabelText('Email')).toHaveProperty('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveProperty('type', 'password');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.queryByLabelText(/Name/)).toBeNull();
  });
  it('checks the form before calling the server', async () => {
    render(<EmailSignIn register={false} />);
    submit('Sign in');
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address');
    type('Email', 'reader@example.com');
    submit('Sign in');
    expect((await screen.findByRole('alert')).textContent).toBe('Enter your password');
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('signs in with a trimmed email and goes to the library', async () => {
    mocks.login.mockResolvedValue(response);
    render(<EmailSignIn register={false} />);
    type('Email', '  reader@example.com ');
    type('Password', 'password123');
    submit('Sign in');
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith(response));
    expect(mocks.login).toHaveBeenCalledWith({ email: 'reader@example.com', password: 'password123' });
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
  it('shows the server error and stays on the page', async () => {
    mocks.login.mockRejectedValue(new Error('Invalid email or password'));
    render(<EmailSignIn register={false} />);
    type('Email', 'reader@example.com');
    type('Password', 'wrong-password');
    submit('Sign in');
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password');
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveProperty('disabled', false);
  });
  it('disables the button while waiting so the form is not sent twice', async () => {
    let finish: (value: typeof response) => void = () => {};
    mocks.login.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<EmailSignIn register={false} />);
    type('Email', 'reader@example.com');
    type('Password', 'password123');
    submit('Sign in');
    const busy = await screen.findByRole('button', { name: 'Please wait…' });
    expect(busy).toHaveProperty('disabled', true);
    fireEvent.click(busy);
    expect(mocks.login).toHaveBeenCalledTimes(1);
    finish(response);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'));
  });
  it('creates an account with an optional name', async () => {
    mocks.register.mockResolvedValue(response);
    render(<EmailSignIn register />);
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
    const hint = screen.getByText('At least 8 characters.');
    expect(screen.getByLabelText('Password').getAttribute('aria-describedby')).toBe(hint.id);
    type('Name (optional)', ' Ada ');
    type('Email', 'ada@example.com');
    type('Password', 'password123');
    submit('Create account');
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith(response));
    expect(mocks.register).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'password123',
      name: 'Ada',
    });
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('leaves the name out when it is blank', async () => {
    mocks.register.mockResolvedValue(response);
    render(<EmailSignIn register />);
    type('Email', 'ada@example.com');
    type('Password', 'password123');
    submit('Create account');
    await waitFor(() => expect(mocks.register).toHaveBeenCalled());
    expect(mocks.register.mock.calls[0][0].name).toBeUndefined();
  });
  it('refuses a short password when creating an account', async () => {
    render(<EmailSignIn register />);
    type('Email', 'ada@example.com');
    type('Password', '1234567');
    submit('Create account');
    expect((await screen.findByRole('alert')).textContent).toBe('Password must be at least 8 characters');
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it('shows a duplicate-email error from the server', async () => {
    mocks.register.mockRejectedValue(new Error('Email already registered'));
    render(<EmailSignIn register />);
    type('Email', 'ada@example.com');
    type('Password', 'password123');
    submit('Create account');
    expect((await screen.findByRole('alert')).textContent).toBe('Email already registered');
  });
});
