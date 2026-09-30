import React from 'react';
import { useAppStore } from '../../../modules/store';
import { openAccount } from '../../../modules/account';
import { useSocialStore } from '../../../modules/social';
import { useChatStore } from '../../../modules/chat';
import Avatar from '../account/Avatar';

type PageId = 'discover' | 'oracle' | 'library' | 'search' | 'settings' | 'calendar' | 'manga' | 'friends';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

interface NavItem {
  id: PageId;
  icon: string;
  label: string;
  /** Contador destacado (p. ej. solicitudes de amistad pendientes). */
  badge?: number;
}

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Explorar',
    items: [
      { id: 'discover', icon: 'explore', label: 'Descubrir' },
      { id: 'search', icon: 'search', label: 'Buscar' },
      { id: 'oracle', icon: 'auto_awesome', label: 'Oráculo' },
      { id: 'calendar', icon: 'calendar_month', label: 'Calendario' },
    ],
  },
  {
    title: 'Biblioteca',
    items: [
      { id: 'library', icon: 'video_library', label: 'Mi Lista' },
      { id: 'manga', icon: 'menu_book', label: 'Manga' },
    ],
  },
  {
    title: 'Comunidad',
    items: [{ id: 'friends', icon: 'group', label: 'Amigos' }],
  },
];

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={`nav-${item.id}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`
        group relative flex items-center gap-2.5 h-[34px] px-2.5 rounded-[9px]
        text-[13.5px] font-medium tracking-[-0.01em] text-left
        transition-all duration-200 ease-mac
        ${
          active
            ? 'text-white bg-primary/[0.17] shadow-[inset_0_0_0_0.5px_rgba(255,61,90,0.35)]'
            : 'text-on-surface-variant hover:text-white hover:bg-white/[0.06]'
        }
      `}
    >
      <span
        className={`material-symbols-outlined text-[19px] transition-colors ${
          active ? 'filled text-primary' : 'text-muted group-hover:text-on-surface-variant'
        }`}
      >
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="min-w-[19px] h-[19px] px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center shadow-moon">
          {item.badge}
        </span>
      ) : null}
    </button>
  );
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const account = useAppStore((s) => s.account);
  const pendingRequests = useSocialStore((s) => s.requests.filter((r) => r.direction === 'incoming').length);
  const unreadMessages = useChatStore((s) => s.totalUnread);
  const pending = pendingRequests + unreadMessages; // solicitudes + mensajes sin leer
  const profile = account.profile;
  return (
    <aside
      className="
        sidebar-surface fixed left-0 top-0 bottom-0 z-50
        w-[232px] flex flex-col
        border-r-[0.5px] border-white/[0.08]
      "
    >
      {/* Zona de arrastre bajo los semáforos de macOS */}
      <div className="h-[52px] flex-none titlebar-drag" />

      {/* Marca */}
      <button
        onClick={() => onNavigate('discover')}
        className="titlebar-no-drag mx-4 mb-5 flex items-center gap-3 group text-left"
        title="KageView"
      >
        <span className="relative flex-none">
          <span className="absolute inset-0 rounded-[11px] bg-primary/40 blur-lg opacity-60 group-hover:opacity-90 transition-opacity" />
          <img
            src={require('../../../../assets/icon.png')}
            alt="KageView"
            className="relative w-[38px] h-[38px] object-cover rounded-[11px] ring-[0.5px] ring-white/20 shadow-lg group-hover:scale-105 transition-transform duration-300 ease-mac"
          />
        </span>
        <span className="flex flex-col leading-none">
          <span className="font-headline font-bold text-[17px] tracking-[-0.02em] text-white">
            Kage<span className="text-primary">View</span>
          </span>
          <span className="mt-1 text-[10px] font-medium tracking-[0.28em] text-muted uppercase">
            影 · Anime
          </span>
        </span>
      </button>

      {/* Navegación */}
      <nav className="flex flex-col px-3 flex-1 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-2.5 mb-1 text-[11px] font-semibold tracking-wide text-muted/80">
              {section.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((rawItem) => {
                const item = rawItem.id === 'friends' && pending > 0 ? { ...rawItem, badge: pending } : rawItem;
                return (
                <NavButton
                  key={item.id}
                  item={item}
                  active={activePage === item.id}
                  onClick={() => onNavigate(item.id)}
                />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Ajustes + cuenta */}
      <div className="px-3 pb-3 flex flex-col gap-2">
        <NavButton
          item={{ id: 'settings', icon: 'settings', label: 'Ajustes' }}
          active={activePage === 'settings'}
          onClick={() => onNavigate('settings')}
        />

        <button
          onClick={openAccount}
          disabled={account.status === 'loading'}
          aria-label={account.status === 'signedIn' ? 'Abrir mi perfil' : 'Iniciar sesión'}
          className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.045] hairline hover:bg-white/[0.08] transition-colors text-left w-full"
        >
          {account.status === 'signedIn' && profile ? (
            <>
              <Avatar profile={profile} size={32} className="ring-1 ring-primary/40" />
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[12.5px] font-semibold text-white truncate">
                  {profile.displayName || profile.username}
                </span>
                <span className="text-[11px] text-muted truncate">@{profile.username}</span>
              </div>
            </>
          ) : account.status === 'loading' ? (
            <>
              <div className="w-8 h-8 rounded-full skeleton" />
              <div className="flex flex-col gap-1.5">
                <div className="w-20 h-2.5 rounded skeleton" />
                <div className="w-14 h-2 rounded skeleton" />
              </div>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center hairline">
                <span className="material-symbols-outlined text-muted text-[17px]">
                  {account.status === 'unavailable' ? 'cloud_off' : 'person'}
                </span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[12.5px] font-semibold text-white">
                  {account.status === 'unavailable' ? 'Sin cuentas' : 'Iniciar sesión'}
                </span>
                <span className="text-[11px] text-muted">
                  {account.status === 'unavailable' ? 'No configuradas' : 'Guarda tu lista'}
                </span>
              </div>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
