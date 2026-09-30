import React, { useEffect, useRef, useState } from 'react';
import { ListStatus } from '../../../modules/backend';
import { requireAccount } from '../../../modules/account';
import { setListStatus } from '../../../modules/library';
import { useAppStore } from '../../../modules/store';
import { AniListAnime } from '../../../types/types';

export const STATUS_LABEL: Record<ListStatus, string> = {
  CURRENT: 'Viendo',
  PLANNING: 'Por ver',
  COMPLETED: 'Completado',
  PAUSED: 'En pausa',
  DROPPED: 'Abandonado',
  REPEATING: 'Repitiendo',
};

const STATUS_ICON: Record<ListStatus, string> = {
  CURRENT: 'play_circle',
  PLANNING: 'bookmark',
  COMPLETED: 'check_circle',
  PAUSED: 'pause_circle',
  DROPPED: 'cancel',
  REPEATING: 'replay',
};

const OPTIONS: ListStatus[] = ['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED'];

/**
 * Botón "Añadir a mi lista" con menú de estados. Sin sesión abre el acceso;
 * con sesión guarda en Supabase (actualización optimista con reversión).
 */
export default function ListStatusButton({ anime }: { anime: AniListAnime }) {
  const entry = useAppStore((s) => s.myList[anime.id]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
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

  const choose = (status: ListStatus | null) => {
    setOpen(false);
    setListStatus(anime, status).catch(() => { /* ya se avisó al usuario */ });
  };

  const onMain = () => {
    if (!requireAccount('Inicia sesión para guardar este anime en tu lista.')) return;
    setOpen((o) => !o);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={onMain}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-11 px-5 rounded-full text-[14px] font-medium flex items-center gap-2 transition-colors ${
          entry
            ? 'bg-primary/15 text-white ring-1 ring-primary/40 hover:bg-primary/25'
            : 'bg-white/[0.08] text-white hover:bg-white/[0.15]'
        }`}
      >
        <span className={`material-symbols-outlined text-[20px] ${entry ? 'filled text-primary' : ''}`}>
          {entry ? STATUS_ICON[entry.status] : 'add'}
        </span>
        {entry ? STATUS_LABEL[entry.status] : 'Añadir a mi lista'}
        <span className="material-symbols-outlined text-[18px] opacity-60 -mr-1">expand_more</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 z-30 w-52 p-1.5 rounded-2xl bg-[#1b0e15] hairline shadow-[0_18px_40px_-8px_rgba(0,0,0,0.9)] animate-fade-in-scale origin-top-left"
        >
          {OPTIONS.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={entry?.status === s}
              onClick={() => choose(s)}
              className={`w-full h-9 px-3 rounded-xl flex items-center gap-2.5 text-[13.5px] text-left transition-colors ${
                entry?.status === s ? 'bg-primary/20 text-white' : 'text-on-surface hover:bg-white/[0.08]'
              }`}
            >
              <span className={`material-symbols-outlined text-[18px] ${entry?.status === s ? 'filled text-primary' : 'text-muted'}`}>
                {STATUS_ICON[s]}
              </span>
              {STATUS_LABEL[s]}
              {entry?.status === s && <span className="material-symbols-outlined text-[16px] ml-auto text-primary">check</span>}
            </button>
          ))}
          {entry && (
            <>
              <div className="my-1 h-px bg-white/[0.08]" />
              <button
                role="menuitem"
                onClick={() => choose(null)}
                className="w-full h-9 px-3 rounded-xl flex items-center gap-2.5 text-[13.5px] text-error hover:bg-error/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Quitar de mi lista
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
