import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2 } from 'lucide-react';
import ChartDBLogo from '@/assets/logo-light.png';
import ChartDBDarkLogo from '@/assets/logo-dark.png';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { Label } from '@/components/label/label';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api/http';
import { APP_NAME, APP_VERSION_LABEL } from '@/lib/branding';

export interface AuthPageProps {
    mode: 'login' | 'signup';
}

const errorMessage = (e: unknown): string => {
    if (e instanceof ApiError) {
        if (e.code === 'NETWORK') return e.message;
        if (e.status === 429) return e.message;
        // Show the server's friendly message for expected 4xx errors.
        if (e.status >= 400 && e.status < 500) return e.message;
    }
    return 'Something went wrong. Please try again.';
};

const AuthForm: React.FC<AuthPageProps> = ({ mode }) => {
    const { user, loading, login, signup } = useAuth();
    const { effectiveTheme } = useTheme();
    const location = useLocation();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const isLogin = mode === 'login';
    const from =
        (location.state as { from?: { pathname: string; search: string } })
            ?.from ?? undefined;

    if (!loading && user) {
        return (
            <Navigate to={from ? from.pathname + from.search : '/'} replace />
        );
    }

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            if (isLogin) {
                await login({ email, password });
            } else {
                await signup({ name, email, password });
            }
        } catch (err) {
            setError(
                isLogin && err instanceof ApiError && err.status === 401
                    ? 'Invalid email or password.'
                    : errorMessage(err)
            );
            setSubmitting(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
            <Helmet>
                <title>{`${isLogin ? 'Sign in' : 'Create account'} - ${APP_NAME}`}</title>
            </Helmet>
            <div className="w-full max-w-sm">
                <div className="mb-8 flex items-center justify-center gap-2">
                    <img
                        src={
                            effectiveTheme === 'dark'
                                ? ChartDBDarkLogo
                                : ChartDBLogo
                        }
                        alt="ChartDB"
                        className="h-6 max-w-fit"
                    />
                    <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                        {APP_VERSION_LABEL}
                    </span>
                </div>

                <div className="rounded-lg border bg-card p-6 shadow-sm">
                    <h1 className="mb-6 text-center text-xl font-semibold tracking-tight">
                        {isLogin ? 'Welcome back' : 'Create account'}
                    </h1>

                    <form onSubmit={onSubmit} className="space-y-4" noValidate>
                        {!isLogin && (
                            <div className="space-y-1.5">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    autoComplete="name"
                                    required
                                    maxLength={100}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                autoFocus
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete={
                                    isLogin
                                        ? 'current-password'
                                        : 'new-password'
                                }
                                required
                                minLength={isLogin ? undefined : 10}
                                aria-describedby={
                                    isLogin ? undefined : 'password-hint'
                                }
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            {!isLogin && (
                                <p
                                    id="password-hint"
                                    className="text-xs text-muted-foreground"
                                >
                                    At least 10 characters, with a letter and a
                                    number.
                                </p>
                            )}
                        </div>

                        {error && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={submitting}
                        >
                            {submitting && (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                            )}
                            {isLogin ? 'Sign in' : 'Create account'}
                        </Button>
                    </form>
                </div>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    {isLogin
                        ? "Don't have an account? "
                        : 'Already have an account? '}
                    <Link
                        to={isLogin ? '/signup' : '/login'}
                        state={location.state}
                        className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    >
                        {isLogin ? 'Sign up' : 'Sign in'}
                    </Link>
                </p>
            </div>
        </main>
    );
};

export const AuthPage: React.FC<AuthPageProps> = (props) => (
    <LocalConfigProvider>
        <ThemeProvider>
            <AuthForm {...props} />
        </ThemeProvider>
    </LocalConfigProvider>
);
