import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AniListAnime } from '../../../types/types';
import {
  WatchHistoryEntry,
  getHistory,
  removeHistoryEntry,
  clearHistory,
} from '../../../modules/watchHistory';
import Spinner from '../ui/Spinner';

interface HistoryModalProps {
  onClose: () => void;
  onSelectAnime: (anime: AniListAnime) => void;
}

// ─── Helpers de fecha ───────────────────────────────────────

const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Etiqueta del grupo al que pertenece una marca temporal. */
function groupLabel(ts: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  const diffDays = Math.round((today - day) / 86_400_000);

  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return 'Esta semana';
  if (diffDays < 30) return 'Este mes';
  return 'Anteriormente';
}

/** Hora (hoy) o fecha corta (días anteriores) para mostrar en cada entrada. */
function entryTime(ts: number): string {
  const d = new Date(ts);
  const isToday = startOfDay(ts) === startOfDay(Date.now());
  if (isToday) {
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
}

// ─── Componente ─────────────────────────────────────────────

export default function HistoryModal({ onClose, onSelectAnime }: HistoryModalProps) {
  const [history, setHistory] = useState<WatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await getHistory();
    setHistory(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Cerrar con Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Agrupar entradas (ya vienen ordenadas desc desde getHistory).
  const groups = useMemo(() => {
    const out: Array<{ label: string; entries: WatchHistoryEntry[] }> = [];
    for (const entry of history) {
      const label = groupLabel(entry.watchedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) {
        last.entries.push(entry);
      } else {
        out.push({ label, entries: [entry] });
      }
    }
    return out;
  }, [history]);

  const handleResume = (anime: AniListAnime) => {
    onSelectAnime(anime);
    onClose();
  };

  const handleRemove = async (e: React.MouseEvent, entry: WatchHistoryEntry) => {
    e.stopPropagation();
    await removeHistoryEntry(entry.anime.id, entry.episode);
    await reload();
  };

  const handleClearAll = async () => {
    if (history.length === 0) return;
    await clearHistory();
    await reload();
  };

  return (
    <div
      id="history-modal-overlay"
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'history-modal-overlay') onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/65 backdrop-blur-2xl" />

      {/* Modal Container */}
      <div className="
        relative z-10
        w-full max-w-2xl h-[82vh]
        bg-surface-container rounded-xl
        flex flex-col overflow-hidden
        animate-fade-in-scale
      ">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-variant/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]">history</span>
            </div>
            <div>
              <h2 className="font-headline text-lg font-bold text-on-surface leading-tight">
                Historial de visualización
              </h2>
              <p className="text-xs text-on-surface-variant">
                {history.length > 0
                  ? `${history.length} ${history.length === 1 ? 'episodio' : 'episodios'} en tu historial`
                  : 'Tu actividad reciente aparecerá aquí'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-headline font-semibold
                  text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors duration-200"
                title="Borrar todo el historial"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                Limpiar
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-surface-variant/40 flex items-center justify-center
                text-on-surface-variant hover:text-on-surface transition-colors duration-200"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={32} />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-4xl">history_toggle_off</span>
              </div>
              <div>
                <p className="font-headline text-lg font-bold text-on-surface">
                  Aún no hay historial
                </p>
                <p className="text-sm text-on-surface-variant mt-1 max-w-xs">
                  Empieza a ver cualquier episodio y se registrará aquí automáticamente.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <div key={group.label}>
                  {/* Group header */}
                  <h3 className="text-xs font-headline font-bold uppercase tracking-wide text-on-surface-variant/70 px-2 mb-2">
                    {group.label}
                  </h3>

                  <div className="flex flex-col gap-1">
                    {group.entries.map((entry) => {
                      const title = entry.anime.title.english || entry.anime.title.romaji;
                      const total = entry.anime.episodes;
                      return (
                        <div
                          key={`${entry.anime.id}-${entry.episode}`}
                          onClick={() => handleResume(entry.anime)}
                          role="button"
                          tabIndex={0}
                          className="group flex items-center gap-3 p-2 rounded-xl cursor-pointer
                            hover:bg-surface-container-high/60 transition-colors duration-150 focus:outline-none"
                        >
                          {/* Thumbnail */}
                          <div className="relative w-14 h-20 flex-none rounded-lg overflow-hidden bg-surface-container-high">
                            <img
                              src={entry.anime.coverImage.large}
                              alt={title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {/* Play overlay on hover */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center">
                              <span className="material-symbols-outlined filled text-white text-2xl">play_arrow</span>
                            </div>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-headline font-semibold text-sm text-on-surface line-clamp-1">
                              {title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-primary font-semibold">
                                Episodio {entry.episode}
                                {total ? <span className="text-on-surface-variant/60 font-normal"> / {total}</span> : null}
                              </span>
                              <span className="text-[10px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded
                                bg-surface-container-high text-on-surface-variant">
                                {entry.mode}
                              </span>
                            </div>
                            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                              {entryTime(entry.watchedAt)}
                            </p>
                          </div>

                          {/* Remove */}
                          <button
                            onClick={(e) => handleRemove(e, entry)}
                            className="w-8 h-8 flex-none rounded-lg flex items-center justify-center
                              text-on-surface-variant opacity-0 group-hover:opacity-100
                              hover:text-error hover:bg-error/10 transition-all duration-150"
                            title="Quitar del historial"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
