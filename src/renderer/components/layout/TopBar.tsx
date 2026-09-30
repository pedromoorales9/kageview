import React, { useEffect } from 'react';
import { useAppStore } from '../../../modules/store';
import { openAccount } from '../../../modules/account';
import Avatar from '../account/Avatar';

type PageId = 'discover' | 'oracle' | 'library' | 'search' | 'settings' | 'calendar' | 'manga' | 'friends';

interface TopBarProps {
  activePage: PageId;
  onOpenHistory?: () => void;
  onNavigate?: (page: PageId) => void;
}

const PAGE_TITLES: Record<PageId, string> = {
  discover: 'Descubrir',
  oracle: 'Oráculo',
  library: 'Mi Lista',
  search: 'Buscar',
  settings: 'Ajustes',
  calendar: 'Calendario',
  manga: 'Manga',
  friends: 'Amigos',
};

const isMac = window.electron?.platform === 'darwin';

export default function TopBar({ activePage, onOpenHistory, onNavigate }: TopBarProps) {
  const account = useAppStore((s) => s.account);

  // ⌘K / Ctrl+K → ir a Buscar (como el buscador global de una app nativa)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onNavigate?.('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNavigate]);

  return (
    <header
      className="
        fixed top-0 right-0 z-40 h-[52px]
        flex items-center justify-between gap-4 px-6
        bg-[rgba(9,5,10,0.72)]
        backdrop-blur-[16px]
        border-b-[0.5px] border-white/[0.08]
        titlebar-drag
      "
      style={{ left: '232px' }}
    >
      {/* Izquierda: título de la sección */}
      <div className="w-1/3 flex items-center">
        <h1 className="text-[15px] font-semibold tracking-[-0.015em] text-white">
          {PAGE_TITLES[activePage]}
        </h1>
      </div>

      {/* Centro: campo de búsqueda */}
      <div className="w-1/3 flex justify-center titlebar-no-drag">
        {activePage !== 'search' && (
          <button
            onClick={() => onNavigate?.('search')}
            className="
              group flex items-center gap-2 w-full max-w-[320px] h-[30px] px-3
              rounded-[9px] bg-white/[0.07] hover:bg-white/[0.11]
              shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1)]
              transition-colors duration-200
            "
          >
            <span className="material-symbols-outlined text-muted group-hover:text-on-surface-variant text-[16px] transition-colors">
              search
            </span>
            <span className="flex-1 text-left text-[12.5px] text-muted select-none">
              Buscar anime…
            </span>
            <span className="kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
          </button>
        )}
      </div>

      {/* Derecha: acciones */}
      <div className="w-1/3 flex items-center justify-end gap-1.5 titlebar-no-drag">
        <button
          id="topbar-history"
          onClick={() => onOpenHistory?.()}
          title="Historial de visualización"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">history</span>
        </button>

        <button
          onClick={openAccount}
          className="ml-1 hover:scale-105 active:scale-95 transition-transform"
          title={account.status === 'signedIn' ? 'Mi perfil' : 'Iniciar sesión'}
          aria-label={account.status === 'signedIn' ? 'Mi perfil' : 'Iniciar sesión'}
        >
          {account.status === 'signedIn' && account.profile ? (
            <Avatar profile={account.profile} size={28} className="ring-1 ring-primary/50" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center hairline">
              <span className="material-symbols-outlined text-muted text-[16px]">person</span>
            </div>
          )}
        </button>

        {/* Controles de ventana (Windows/Linux) */}
        {window.electron?.platform !== 'darwin' && (
          <div className="flex items-center gap-1 border-l border-white/10 pl-3 ml-2">
            <button
              id="topbar-minimize"
              onClick={() => window.electron.windowControls.minimize()}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors text-muted hover:text-white"
              title="Minimizar"
            >
              <span className="material-symbols-outlined text-[16px]">remove</span>
            </button>
            <button
              id="topbar-maximize"
              onClick={() => window.electron.windowControls.maximize()}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors text-muted hover:text-white"
              title="Maximizar"
            >
              <span className="material-symbols-outlined text-[14px]">crop_square</span>
            </button>
            <button
              id="topbar-close"
              onClick={() => window.electron.windowControls.close()}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-primary hover:text-white transition-colors text-muted"
              title="Cerrar"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
