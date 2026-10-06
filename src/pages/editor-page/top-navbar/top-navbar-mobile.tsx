import React from 'react';
import ChartDBLogo from '@/assets/logo-2.png';
import { DiagramName } from './diagram-name';
import { LanguageNav } from './language-nav/language-nav';
import { Menu } from './menu/menu';
import { UserMenu } from './user-menu';
import { SyncStatusBadge } from './sync-status';
import { ShareDialog } from './share-dialog';
import { Button } from '@/components/button/button';
import { useSidebar } from '@/components/sidebar/use-sidebar';
import { MenuIcon } from 'lucide-react';

export interface TopNavbarMobileProps {}

export const TopNavbarMobile: React.FC<TopNavbarMobileProps> = () => {
    const { toggleSidebar } = useSidebar();

    return (
        <nav className="flex flex-col justify-between border-b px-3 md:h-12 md:flex-row md:items-center md:px-4">
            <div className="flex flex-1 flex-col justify-between gap-x-1 md:flex-row md:justify-normal">
                <div className="flex items-center justify-between pt-[8px] font-primary md:py-[10px]">
                    <div className="flex items-center gap-2">
                        <Button
                            size={'icon'}
                            variant="ghost"
                            onClick={toggleSidebar}
                        >
                            <MenuIcon className="size-5" />
                        </Button>
                        <a href="/" className="cursor-pointer" rel="noreferrer">
                            <img
                                src={ChartDBLogo}
                                alt="chartDB"
                                className="h-4 max-w-fit"
                            />
                        </a>
                    </div>

                    <div className="flex items-center gap-2">
                        <SyncStatusBadge />
                        <ShareDialog />
                        <LanguageNav />
                        <UserMenu />
                    </div>
                </div>
                <Menu />
            </div>

            <div className="flex flex-1 justify-center pb-2 pt-1">
                <DiagramName />
            </div>
        </nav>
    );
};
