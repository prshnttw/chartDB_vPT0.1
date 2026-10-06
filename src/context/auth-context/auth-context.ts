import { createContext } from 'react';
import type { AuthUser } from '@/lib/api/auth-api';
import { emptyFn } from '@/lib/utils';

export interface AuthContext {
    user: AuthUser | null;
    loading: boolean;
    login: (params: { email: string; password: string }) => Promise<void>;
    signup: (params: {
        name: string;
        email: string;
        password: string;
    }) => Promise<void>;
    logout: () => Promise<void>;
}

export const authContext = createContext<AuthContext>({
    user: null,
    loading: false,
    login: emptyFn,
    signup: emptyFn,
    logout: emptyFn,
});
