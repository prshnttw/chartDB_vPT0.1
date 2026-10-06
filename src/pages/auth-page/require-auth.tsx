import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export const RequireAuth: React.FC = () => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div
                className="flex h-screen items-center justify-center text-muted-foreground"
                role="status"
                aria-live="polite"
            >
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading...
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    return <Outlet />;
};
