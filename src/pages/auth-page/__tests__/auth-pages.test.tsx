import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from '@/context/auth-context/auth-provider';
import { ApiError } from '@/lib/api/http';
import { UserMenu } from '@/pages/editor-page/top-navbar/user-menu';
import { AuthPage } from '../auth-page';
import { RequireAuth } from '../require-auth';

vi.mock('@/lib/api/auth-api', () => ({
    authApi: {
        me: vi.fn(),
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
    },
}));
import { authApi } from '@/lib/api/auth-api';
const api = vi.mocked(authApi);

const user = { id: 'u1', name: 'Pat', email: 'pat@cbr-iisc.ac.in' };
const unauthenticated = () =>
    api.me.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));

const renderApp = (initial: string) =>
    render(
        <HelmetProvider>
            <AuthProvider>
                <MemoryRouter initialEntries={[initial]}>
                    <Routes>
                        <Route
                            path="/login"
                            element={<AuthPage mode="login" />}
                        />
                        <Route
                            path="/signup"
                            element={<AuthPage mode="signup" />}
                        />
                        <Route element={<RequireAuth />}>
                            <Route path="/" element={<div>EDITOR</div>} />
                        </Route>
                    </Routes>
                </MemoryRouter>
            </AuthProvider>
        </HelmetProvider>
    );

const fillAndSubmit = async (
    fields: Record<string, string>,
    button: string
) => {
    for (const [label, value] of Object.entries(fields)) {
        await userEvent.type(await screen.findByLabelText(label), value);
    }
    await userEvent.click(screen.getByRole('button', { name: button }));
};

beforeEach(() => {
    vi.resetAllMocks();
    window.matchMedia ??= vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
});

describe('route protection', () => {
    it('shows a loading state while the session is checked', () => {
        api.me.mockReturnValue(new Promise(() => undefined));
        renderApp('/');
        expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    });

    it('redirects unauthenticated visitors to the login page', async () => {
        unauthenticated();
        renderApp('/');
        expect(
            await screen.findByRole('heading', { name: 'Welcome back' })
        ).toBeInTheDocument();
        expect(screen.queryByText('EDITOR')).not.toBeInTheDocument();
    });

    it('renders the app for an authenticated user', async () => {
        api.me.mockResolvedValue(user);
        renderApp('/');
        expect(await screen.findByText('EDITOR')).toBeInTheDocument();
    });
});

describe('login page', () => {
    beforeEach(() => {
        unauthenticated();
    });

    it('shows a friendly error on invalid credentials', async () => {
        api.login.mockRejectedValue(
            new ApiError(
                401,
                'INVALID_CREDENTIALS',
                'Invalid email or password.'
            )
        );
        renderApp('/login');
        await fillAndSubmit({ Email: 'a@b.co', Password: 'wrong' }, 'Sign in');
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Invalid email or password.'
        );
    });

    it('logs in and lands on the editor', async () => {
        api.login.mockResolvedValue(user);
        renderApp('/login');
        await fillAndSubmit(
            { Email: 'pat@cbr-iisc.ac.in', Password: 'secret-pass-1' },
            'Sign in'
        );
        expect(await screen.findByText('EDITOR')).toBeInTheDocument();
        expect(api.login).toHaveBeenCalledWith({
            email: 'pat@cbr-iisc.ac.in',
            password: 'secret-pass-1',
        });
    });

    it('does not leak raw errors for unexpected failures', async () => {
        api.login.mockRejectedValue(new Error('boom: stack trace'));
        renderApp('/login');
        await fillAndSubmit({ Email: 'a@b.co', Password: 'x' }, 'Sign in');
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong. Please try again.'
        );
    });

    it('links to signup', async () => {
        renderApp('/login');
        await userEvent.click(
            await screen.findByRole('link', { name: 'Sign up' })
        );
        expect(
            await screen.findByRole('heading', { name: 'Create account' })
        ).toBeInTheDocument();
    });
});

describe('signup page', () => {
    beforeEach(() => {
        unauthenticated();
    });

    it('shows the server message for a disallowed email domain', async () => {
        api.signup.mockRejectedValue(
            new ApiError(
                403,
                'EMAIL_DOMAIN_NOT_ALLOWED',
                'Signup is restricted to @cbr-iisc.ac.in email addresses.'
            )
        );
        renderApp('/signup');
        await fillAndSubmit(
            {
                Name: 'Pat',
                Email: 'pat@gmail.com',
                Password: 'secret-pass-1',
            },
            'Create account'
        );
        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent(
                'restricted to @cbr-iisc.ac.in'
            )
        );
    });

    it('creates the account and enters the app', async () => {
        api.signup.mockResolvedValue(user);
        renderApp('/signup');
        await fillAndSubmit(
            {
                Name: 'Pat',
                Email: 'pat@cbr-iisc.ac.in',
                Password: 'secret-pass-1',
            },
            'Create account'
        );
        expect(await screen.findByText('EDITOR')).toBeInTheDocument();
    });
});

describe('logout', () => {
    it('clears the user and returns to login', async () => {
        api.me.mockResolvedValue(user);
        api.logout.mockResolvedValue({ ok: true });
        render(
            <AuthProvider>
                <MemoryRouter initialEntries={['/']}>
                    <Routes>
                        <Route path="/" element={<UserMenu />} />
                        <Route path="/login" element={<div>LOGIN</div>} />
                    </Routes>
                </MemoryRouter>
            </AuthProvider>
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'Account menu' })
        );
        await userEvent.click(
            await screen.findByRole('menuitem', { name: /log out/i })
        );
        expect(await screen.findByText('LOGIN')).toBeInTheDocument();
        expect(api.logout).toHaveBeenCalled();
    });
});
