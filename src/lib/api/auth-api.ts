import { apiFetch } from './http';

export interface AuthUser {
    id: string;
    name: string | null;
    email: string;
}

export const authApi = {
    me: () => apiFetch<{ user: AuthUser }>('/auth/me').then((r) => r.user),
    login: (body: { email: string; password: string }) =>
        apiFetch<{ user: AuthUser }>('/auth/login', {
            method: 'POST',
            body,
        }).then((r) => r.user),
    signup: (body: { name: string; email: string; password: string }) =>
        apiFetch<{ user: AuthUser }>('/auth/signup', {
            method: 'POST',
            body,
        }).then((r) => r.user),
    logout: () => apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' }),
};
