import React, { useEffect, useMemo, useState } from 'react';
import { PublicProfile, ListStatus } from '../../../modules/backend';
import { getFriendList } from '../../../modules/library';
import { isWatchingNow, timeAgo, useSocialStore } from '../../../modules/social';
import { AniListAnime } from '../../../types/types';
import Avatar from '../account/Avatar';
import AnimeCard from '../anime/AnimeCard';
import Spinner from '../ui/Spinner';
import CoverImage from '../ui/CoverImage';

const TABS: Array<{ status: ListStatus; label: string }> = [
  { status: 'CURRENT', label: 'Viendo' },
  { status: 'COMPLETED', label: 'Completados' },
  { status: 'PLANNING', label: 'Por ver' },
  { status: 'PAUSED', label: 'En pausa' },
  { status: 'DROPPED', label: 'Abandonados' },
];

interface FriendProfileModalProps {
  friend: PublicProfile;
  since?: string;
  onClose: () => void;
  onSelectAnime: (anime: AniListAnime) => void;
  /** Abre el chat con este amigo. */
  onMessage?: () => void;
}

/** Perfil de un amigo: actividad actual y sus listas (si las comparte). */
export default function FriendProfileModal({ friend, since, onClose, onSelectAnime, onMessage }: FriendProfileModalProps) {
  const activity = useSocialStore((s) => s.activity.find((a) => a.userId === friend.id));
  const [list, setList] = useState<AniListAnime[] | null>(null);
  const [tab, setTab] = useState<ListStatus>('CURRENT');

  useEffect(() => {
    let cancelled = false;
    setList(null);
    getFriendList(friend.id)
      .then((l) => !cancelled && setList(l))
      .catch(() => !cancelled && setList([]));
    return () => { cancelled = true; };
  }, [friend.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (list ?? []).forEach((a) => {
      const s = a.mediaListEntry?.status;
      if (s) c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [list]);

  const visible = useMemo(
    () => (list ?? []).filter((a) => a.mediaListEntry?.status === tab),
    [list, tab]
  );

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-6 bg-[#09050a]/80 animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil de ${friend.displayName || friend.username}`}
        className="relative w-full max-w-4xl h-[86vh] flex flex-col rounded-[28px] bg-[#130a11] hairline shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] animate-fade-in-scale overflow-hidden"
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined text-[19px]">close</span>
        </button>

        {/* Cabecera */}
        <div className="relative flex-none px-8 pt-8 pb-5 flex items-center gap-5">
          <div className="pointer-events-none absolute -top-28 -left-20 w-[340px] h-[340px] rounded-full bg-[radial-gradient(circle,rgba(255,61,90,0.14),transparent_68%)]" />
          <Avatar profile={friend} size={84} className="relative ring-2 ring-primary/40" />
          <div className="relative min-w-0 flex-1">
            <h2 className="font-headline text-[24px] font-bold text-white tracking-[-0.03em] truncate">
              {friend.displayName || friend.username}
            </h2>
            <p className="text-[13.5px] text-secondary">@{friend.username}</p>
            {friend.bio && <p className="text-[13.5px] text-on-surface-variant mt-1.5 leading-snug max-w-xl">{friend.bio}</p>}
            {onMessage && (
              <button onClick={onMessage} className="btn-moon h-9 px-4 rounded-full mt-3 text-[13px] font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined filled text-[17px]">chat_bubble</span>
                Enviar mensaje
              </button>
            )}
            {since && <p className="text-[12px] text-muted mt-1.5">Amigos desde {new Date(since).toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })}</p>}
          </div>
        </div>

        {/* Viendo ahora */}
        {activity && (
          <div className="flex-none mx-8 mb-4 flex items-center gap-3.5 rounded-2xl bg-white/[0.05] hairline p-3">
            <CoverImage src={activity.coverUrl} className="w-10 h-14 rounded-lg flex-none" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                {isWatchingNow(activity) ? (
                  <><span className="w-1.5 h-1.5 rounded-full bg-[#35e66a] shadow-[0_0_6px_#35e66a]" />Viendo ahora</>
                ) : (
                  <>Última actividad · {timeAgo(activity.updatedAt)}</>
                )}
              </p>
              <p className="text-[14px] text-white font-medium truncate">{activity.title}</p>
              <p className="text-[12.5px] text-on-surface-variant">
                Episodio {activity.episode}{activity.totalEpisodes ? ` de ${activity.totalEpisodes}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Pestañas de lista */}
        <div className="flex-none px-8 flex items-center gap-1.5 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.status}
              onClick={() => setTab(t.status)}
              aria-pressed={tab === t.status}
              className={`h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-colors ${
                tab === t.status
                  ? 'bg-primary text-white shadow-moon'
                  : 'bg-white/[0.06] text-on-surface-variant hover:bg-white/[0.11] hover:text-white'
              }`}
            >
              {t.label}
              {counts[t.status] ? <span className="ml-1.5 opacity-70 tabular-nums">{counts[t.status]}</span> : null}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-8 pt-5 pb-8">
          {list === null ? (
            <div className="h-full flex items-center justify-center"><Spinner size={32} /></div>
          ) : list.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] opacity-50">visibility_off</span>
              <p className="text-[14px]">No hay nada que mostrar.</p>
              <p className="text-[12.5px] text-muted max-w-xs">Su lista está vacía o no la comparte con sus amigos.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-center text-[13.5px] text-muted pt-10">Nada en esta lista todavía.</p>
          ) : (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(130px,1fr))]">
              {visible.map((a) => (
                <AnimeCard
                  key={a.id}
                  anime={a}
                  showProgress
                  progress={a.mediaListEntry?.progress ?? 0}
                  onClick={() => onSelectAnime(a)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
