import React from 'react';

type PageId = 'discover' | 'oracle' | 'library' | 'search' | 'settings' | 'calendar';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  userAvatar?: string | null;
}

const NAV_ITEMS: Array<{ id: PageId; icon: string; label: string }> = [
  { id: 'discover', icon: 'explore', label: 'Descubrir' },
  { id: 'oracle', icon: 'flare', label: 'Oráculo' },
  { id: 'library', icon: 'auto_stories', label: 'Mi Lista' },
  { id: 'calendar', icon: 'calendar_month', label: 'Calendario' },
  { id: 'search', icon: 'search', label: 'Buscar' },
  { id: 'settings', icon: 'settings', label: 'Ajustes' },
];

export default function Sidebar({
  activePage,
  onNavigate,
  userAvatar,
}: SidebarProps) {
  return (
    <aside
      className="
        fixed left-0 top-0 bottom-0 z-50
        w-20 flex flex-col items-center
        bg-surface-container-lowest
        shadow-[1px_0_0_0_rgba(203,151,255,0.06)]
      "
    >
      {/* Logo */}
      <div className="mt-6 mb-8 flex flex-col items-center gap-1.5">
        <button 
          onClick={() => onNavigate('discover')}
          className="focus:outline-none hover:scale-105 transition-transform duration-300"
          title="KageView"
        >
          <img 
            src={require('../../../../assets/icon.png')} 
            alt="KageView Logo" 
            className="w-10 h-10 shadow-lg object-cover rounded-[10px]"
          />
        </button>
      </div>

      {/* Navigation Icons */}
      <nav className="flex flex-col items-center gap-2 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <div key={item.id} className="relative group">
              <button
                id={`nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                className={`
                  relative flex items-center justify-center
                  w-12 h-12 rounded-xl
                  transition-all duration-200 ease-out-custom
                  ${
                    isActive
                      ? 'text-primary bg-primary/10'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
                  }
                `}
              >
                <span className={`material-symbols-outlined ${isActive ? 'filled' : ''}`}>
                  {item.icon}
                </span>

                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-l-full" />
                )}
              </button>

              {/* Tooltip */}
              <div
                className="
                  absolute left-full top-1/2 -translate-y-1/2 ml-3
                  px-2.5 py-1 rounded-md
                  bg-surface-container-highest text-on-surface text-xs font-medium
                  opacity-0 group-hover:opacity-100
                  pointer-events-none
                  transition-opacity duration-150
                  whitespace-nowrap
                  z-[60]
                "
              >
                {item.label}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User Avatar */}
      <div className="mb-6">
        {userAvatar ? (
          <img
            src={userAvatar}
            alt="User avatar"
            className="w-9 h-9 rounded-full object-cover ring-2 ring-surface-container-high"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">
              person
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
