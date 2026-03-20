import React from 'react';

type PageId = 'discover' | 'oracle' | 'library' | 'search' | 'settings';

interface TopBarProps {
  activePage: PageId;
  userAvatar?: string | null;
}

const PAGE_TITLES: Record<PageId, string> = {
  discover: '',
  oracle: '',
  library: '',
  search: '',
  settings: 'Ajustes',
};

export default function TopBar({ activePage, userAvatar }: TopBarProps) {
  const pageTitle = PAGE_TITLES[activePage];

  return (
    <header
      className="
        fixed top-0 right-0 z-40
        h-16 flex items-center justify-between
        px-6
        backdrop-blur-xl bg-background/70
        titlebar-drag
      "
      style={{ left: '80px' }}
    >
      {/* Left: Breadcrumb (solo en settings) */}
      <div className="titlebar-no-drag">
        {pageTitle && (
          <h2 className="text-sm font-headline font-semibold text-on-surface-variant">
            {pageTitle}
          </h2>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3 titlebar-no-drag">
        {/* Notifications */}
        <button
          id="topbar-notifications"
          onClick={() => alert('¡El panel de Notificaciones de nuevos episodios estará disponible en la próxima actualización de KageView!')}
          className="
            relative w-9 h-9 flex items-center justify-center
            rounded-lg text-on-surface-variant
            hover:text-on-surface hover:bg-surface-container-high/50
            transition-all duration-200
          "
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-secondary" />
        </button>

        {/* History */}
        <button
          id="topbar-history"
          onClick={() => alert('El Historial detallado de visualización se añadirá pronto.\\nPor ahora, tu progreso se guarda automáticamente en la pestaña Biblioteca > Viendo.')}
          className="
            w-9 h-9 flex items-center justify-center
            rounded-lg text-on-surface-variant
            hover:text-on-surface hover:bg-surface-container-high/50
            transition-all duration-200
          "
        >
          <span className="material-symbols-outlined text-[20px]">history</span>
        </button>

        {/* Avatar */}
        <button
          onClick={() => alert('Pronto podrás editar tu perfil de AniList directamente desde aquí.\\nPara modificar tus ajustes de cuenta, usa la web oficial de AniList de momento.')}
          className="hover:scale-105 transition-transform"
        >
          {userAvatar ? (
            <img
              src={userAvatar}
              alt="User"
              className="w-8 h-8 rounded-full object-cover ring-1 ring-surface-container-highest"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant text-base">
                person
              </span>
            </div>
          )}
        </button>

        {/* Window controls (Windows/Linux) */}
        {window.electron?.platform !== 'darwin' && (
          <div className="flex items-center gap-1 border-l border-surface-container-high pl-3 ml-1 titlebar-no-drag">
            <button
              id="topbar-minimize"
              onClick={() => window.electron.windowControls.minimize()}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-container-high transition-colors text-on-surface-variant hover:text-on-surface"
              title="Minimizar"
            >
              <span className="material-symbols-outlined text-[18px]">remove</span>
            </button>
            <button
              id="topbar-maximize"
              onClick={() => window.electron.windowControls.maximize()}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface-container-high transition-colors text-on-surface-variant hover:text-on-surface"
              title="Maximizar"
            >
              <span className="material-symbols-outlined text-[16px]">crop_square</span>
            </button>
            <button
              id="topbar-close"
              onClick={() => window.electron.windowControls.close()}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-error/80 hover:text-white transition-colors text-on-surface-variant"
              title="Cerrar"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
