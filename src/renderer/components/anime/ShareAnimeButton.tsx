import React, { useEffect, useRef, useState } from 'react';
import { requireAccount } from '../../../modules/account';
import { sendAnime } from '../../../modules/chat';
import { toSnapshot } from '../../../modules/library';
import { notify } from '../../../modules/notify';
import { useSocialStore } from '../../../modules/social';
import { AniListAnime } from '../../../types/types';
import Avatar from '../account/Avatar';

/** "Compartir": envía este anime por chat a un amigo (como tarjeta con portada). */
export default function ShareAnimeButton({ anime }: { anime: AniListAnime }) {
  const friends = useSocialStore((s) => s.friends);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // no cierres también el modal del anime
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggle = () => {
    if (!requireAccount('Inicia sesión para compartir anime con tus amigos.')) return;
    setOpen((o) => !o);
  };

  const share = (friendId: string, name: string) => {
    setOpen(false);
    if (sendAnime(friendId, toSnapshot(anime))) notify('success', `Enviado a ${name}.`);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Compartir con un amigo"
        className="h-11 px-5 rounded-full text-[14px] font-medium flex items-center gap-2 bg-white/[0.08] text-white hover:bg-white/[0.15] transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">send</span>
        Compartir
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 z-30 w-64 max-h-72 overflow-y-auto p-1.5 rounded-2xl bg-[#1b0e15] hairline shadow-[0_18px_40px_-8px_rgba(0,0,0,0.9)] animate-fade-in-scale origin-top-left"
        >
          {friends.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-on-surface-variant leading-snug">
              Aún no tienes amigos. Añádelos en <b className="text-white">Amigos → Añadir</b>.
            </p>
          ) : (
            <>
              <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Enviar a…</p>
              {friends.map((f) => {
                const name = f.profile.displayName || f.profile.username;
                return (
                  <button
                    key={f.friendshipId}
                    role="menuitem"
                    onClick={() => share(f.profile.id, name)}
                    className="w-full h-11 px-3 rounded-xl flex items-center gap-2.5 text-[13.5px] text-left text-on-surface hover:bg-white/[0.08] transition-colors"
                  >
                    <Avatar profile={f.profile} size={26} />
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
