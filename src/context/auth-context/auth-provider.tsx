import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { authApi, type AuthUser } from '@/lib/api/auth-api';
import { ApiError } from '@/lib/api/http';
import { authContext, type AuthContext } from './auth-context';

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        authApi
            .me()
            .then((u) => !cancelled && setUser(u))
            .catch((e) => {
                // 401 = simply not logged in. Anything else (network) also
                // lands on the login page rather than blocking the app.
                if (!(e instanceof ApiError)) console.error(e);
            })
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, []);

    const login: AuthContext['login'] = useCallback(async (params) => {
        setUser(await authApi.login(params));
    }, []);

    const signup: AuthContext['signup'] = useCallback(async (params) => {
        setUser(await authApi.signup(params));
    }, []);

    const logout: AuthContext['logout'] = useCallback(async () => {
        try {
            await authApi.logout();
        } finally {
            setUser(null);
        }
    }, []);

    const value = useMemo(
        () => ({ user, loading, login, signup, logout }),
        [user, loading, login, signup, logout]
    );

    return (
        <authContext.Provider value={value}>{children}</authContext.Provider>
    );
};
