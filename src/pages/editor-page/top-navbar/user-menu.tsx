import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Users } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';

export const UserMenu: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    if (!user) return null;

    const initial = (user.name || user.email).charAt(0).toUpperCase();

    const onLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label="Account menu"
                className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {initial}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuLabel className="font-normal">
                    <div className="truncate text-sm font-medium">
                        {user.name ?? user.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                        {user.email}
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/shared')}>
                    <Users className="mr-2 size-4" />
                    Shared with me
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onLogout}>
                    <LogOut className="mr-2 size-4" />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
