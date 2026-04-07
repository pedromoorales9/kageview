import React, { useEffect, useState, useCallback } from 'react';
import { AniListAnime, AiringEntry } from '../../types/types';
import useAniList from '../hooks/useAniList';
import { useAppStore } from '../../modules/store';
import Spinner from '../components/ui/Spinner';

interface CalendarPageProps {
  onSelectAnime: (anime: AniListAnime) => void;
  onNotificationsChange?: (enabled: boolean) => void;
}

// ─── Helpers ────────────────────────────────────────────────

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_FULL = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles',
  'Jueves', 'Viernes', 'Sábado',
];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay(); // 0=Dom
  const monday = new Date(referenceDate);
  // Semana Lun→Dom
  monday.setDate(referenceDate.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatCountdown(unixSec: number): string {
  const diff = unixSec - Math.floor(Date.now() / 1000);
  if (diff <= 0) return 'Ya disponible';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── Component ──────────────────────────────────────────────

export default function CalendarPage({ onSelectAnime, onNotificationsChange }: CalendarPageProps) {
  const token = useAppStore((s) => s.token);
  const { getUserList } = useAniList();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [airingList, setAiringList] = useState<AniListAnime[]>([]);
  const [loading, setLoading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [countdown, setCountdown] = useState<Record<number, string>>({});

  const today = new Date();
  const referenceDate = new Date(today);
  referenceDate.setDate(today.getDate() + weekOffset * 7);
  const weekDays = getWeekDays(referenceDate);

  // ─── Cargar animes en emisión ──────────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const list = await getUserList('CURRENT');
        if (cancelled) return;
        // Solo los que tienen nextAiringEpisode
        const airing = list.filter((a) => a.nextAiringEpisode != null);
        setAiringList(airing);

        // Enviar al daemon del proceso principal
        if (window.electron?.setAiringAnimes) {
          const entries: AiringEntry[] = airing
            .filter((a) => a.nextAiringEpisode != null)
            .map((a) => ({
              id: a.id,
              title: a.title.english || a.title.romaji,
              nextEpisode: a.nextAiringEpisode!.episode,
              airingAt: Math.floor(Date.now() / 1000) + a.nextAiringEpisode!.timeUntilAiring,
            }));
          window.electron.setAiringAnimes(entries);
        }
      } catch (err) {
        console.error('[CalendarPage] Error loading list:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [token, getUserList]);

  // ─── Leer estado de notificaciones ────────────────────────
  useEffect(() => {
    if (!window.electron?.getNotificationsEnabled) return;
    window.electron.getNotificationsEnabled().then((val) => setNotifEnabled(val));
  }, []);

  // ─── Countdown en tiempo real ──────────────────────────────
  useEffect(() => {
    if (airingList.length === 0) return;
    const updateCountdowns = () => {
      const newCountdown: Record<number, string> = {};
      for (const anime of airingList) {
        if (anime.nextAiringEpisode) {
          const airingAt = Math.floor(Date.now() / 1000) + anime.nextAiringEpisode.timeUntilAiring;
          newCountdown[anime.id] = formatCountdown(airingAt);
        }
      }
      setCountdown(newCountdown);
    };
    updateCountdowns();
    const interval = setInterval(updateCountdowns, 30_000);
    return () => clearInterval(interval);
  }, [airingList]);

  // ─── Toggle notificaciones ────────────────────────────────
  const toggleNotifications = useCallback(async () => {
    if (!window.electron?.setNotificationsEnabled) return;
    setNotifLoading(true);
    const next = !notifEnabled;
    try {
      await window.electron.setNotificationsEnabled(next);
      setNotifEnabled(next);
      onNotificationsChange?.(next);
    } catch (err) {
      console.error('[CalendarPage] Error toggling notifications:', err);
    } finally {
      setNotifLoading(false);
    }
  }, [notifEnabled, onNotificationsChange]);

  // ─── Animes del día seleccionado ──────────────────────────
  const animesBySelectedDay = airingList.filter((anime) => {
    if (!anime.nextAiringEpisode) return false;
    const airingAt = Math.floor(Date.now() / 1000) + anime.nextAiringEpisode.timeUntilAiring;
    const airingDate = new Date(airingAt * 1000);
    return isSameDay(airingDate, selectedDay);
  });

  // ─── Agrupar todos por día de la semana ──────────────────
  const animesByDay: Record<string, AniListAnime[]> = {};
  for (const d of weekDays) {
    const key = d.toDateString();
    animesByDay[key] = airingList.filter((anime) => {
      if (!anime.nextAiringEpisode) return false;
      const airingAt = Math.floor(Date.now() / 1000) + anime.nextAiringEpisode.timeUntilAiring;
      const airingDate = new Date(airingAt * 1000);
      return isSameDay(airingDate, d);
    });
  }

  // ─── Estado sin AniList ───────────────────────────────────
  if (!token) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
        <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center">
          <span className="material-symbols-outlined filled text-on-primary text-4xl">calendar_month</span>
        </div>
        <h2 className="font-headline text-2xl font-bold text-on-surface">Conecta tu AniList</h2>
        <p className="text-sm text-on-surface-variant text-center max-w-md">
          Conecta tu cuenta de AniList para ver el calendario de emisión de los animes que estás viendo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden pb-4 select-none">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="font-headline text-xl font-bold text-on-surface">Calendario de Emisión</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Animes que estás viendo — próximos episodios
          </p>
        </div>

        {/* Botón de notificaciones */}
        <button
          id="calendar-notifications-toggle"
          onClick={toggleNotifications}
          disabled={notifLoading}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
            transition-all duration-300 border
            ${notifEnabled
              ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25 shadow-[0_0_16px_rgba(203,151,255,0.2)]'
              : 'bg-surface-container-high text-on-surface-variant border-transparent hover:bg-surface-container-highest hover:text-on-surface'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          <span className="material-symbols-outlined text-base">
            {notifEnabled ? 'notifications_active' : 'notifications_off'}
          </span>
          {notifEnabled ? 'Notificaciones ON' : 'Notificaciones OFF'}
          {notifEnabled && (
            <span
              className="w-2 h-2 rounded-full bg-primary animate-pulse"
              aria-label="daemon activo"
            />
          )}
        </button>
      </div>

      {/* ── Week Navigator ── */}
      <div className="flex items-center gap-3 mb-5 flex-shrink-0">
        <button
          id="calendar-prev-week"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="
            w-8 h-8 rounded-lg flex items-center justify-center
            bg-surface-container-high text-on-surface-variant
            hover:bg-surface-container-highest hover:text-on-surface
            transition-all duration-150
          "
        >
          <span className="material-symbols-outlined text-lg">chevron_left</span>
        </button>

        <div className="flex-1 grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => {
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selectedDay);
            const dayKey = day.toDateString();
            const count = animesByDay[dayKey]?.length || 0;

            return (
              <button
                key={dayKey}
                id={`calendar-day-${day.getDay()}`}
                onClick={() => setSelectedDay(day)}
                className={`
                  relative flex flex-col items-center gap-1 py-3 rounded-xl
                  transition-all duration-200
                  ${isSelected
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : isToday
                      ? 'bg-surface-container-high/80 text-on-surface ring-1 ring-primary/20'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }
                `}
              >
                {/* Day name */}
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  {DAY_NAMES[(day.getDay() + 6) % 7 === 6 ? 6 : (day.getDay() + 6) % 7]}
                </span>
                {/* Day number */}
                <span className={`text-base font-bold ${isToday ? 'text-primary' : ''}`}>
                  {day.getDate()}
                </span>
                {/* Dots for airing count */}
                {count > 0 && (
                  <div className="flex gap-0.5">
                    {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-1 h-1 rounded-full ${isSelected ? 'bg-primary' : 'bg-primary/50'}`}
                      />
                    ))}
                    {count > 3 && (
                      <span className="text-[8px] text-primary/70 font-bold">+{count - 3}</span>
                    )}
                  </div>
                )}
                {/* Today marker */}
                {isToday && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        <button
          id="calendar-next-week"
          onClick={() => setWeekOffset((o) => o + 1)}
          className="
            w-8 h-8 rounded-lg flex items-center justify-center
            bg-surface-container-high text-on-surface-variant
            hover:bg-surface-container-highest hover:text-on-surface
            transition-all duration-150
          "
        >
          <span className="material-symbols-outlined text-lg">chevron_right</span>
        </button>
      </div>

      {/* ── Selected Day Label ── */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="h-px flex-1 bg-surface-container-high" />
        <span className="text-sm font-semibold text-on-surface-variant">
          {isSameDay(selectedDay, today) ? '🗓️ Hoy, ' : ''}
          {DAY_NAMES_FULL[selectedDay.getDay()]} {selectedDay.getDate()} de {MONTH_NAMES[selectedDay.getMonth()]}
        </span>
        <div className="h-px flex-1 bg-surface-container-high" />
      </div>

      {/* ── Anime List for Selected Day ── */}
      <div className="flex-1 overflow-y-auto pr-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={32} />
          </div>
        ) : animesBySelectedDay.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-on-surface-variant">
            <span className="text-5xl opacity-30">📭</span>
            <p className="text-sm">No hay episodios programados para este día.</p>
            {airingList.length === 0 && !loading && (
              <p className="text-xs opacity-70 max-w-xs text-center">
                Añade animes en emisión a tu lista de AniList con estado "Viendo"
                para verlos aquí.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {animesBySelectedDay.map((anime) => {
              const airingAt = anime.nextAiringEpisode
                ? Math.floor(Date.now() / 1000) + anime.nextAiringEpisode.timeUntilAiring
                : null;
              const isPast = airingAt != null && airingAt <= Math.floor(Date.now() / 1000);
              const episodeNum = anime.nextAiringEpisode?.episode ?? '?';
              const titleDisplay = anime.title.english || anime.title.romaji;

              return (
                <button
                  key={anime.id}
                  id={`calendar-anime-${anime.id}`}
                  onClick={() => onSelectAnime(anime)}
                  className="
                    group flex items-center gap-4 p-3 rounded-2xl
                    bg-surface-container-low hover:bg-surface-container-high
                    border border-transparent hover:border-primary/10
                    transition-all duration-200 text-left w-full
                    hover:shadow-lg hover:shadow-black/20
                  "
                >
                  {/* Cover */}
                  <div className="relative flex-shrink-0">
                    <img
                      src={anime.coverImage.large}
                      alt={titleDisplay}
                      className="w-14 h-20 object-cover rounded-xl"
                      loading="lazy"
                    />
                    {isPast && (
                      <div
                        className="
                          absolute inset-0 rounded-xl
                          bg-success/20 flex items-center justify-center
                        "
                      >
                        <span className="material-symbols-outlined text-success text-xl">check_circle</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="
                        font-headline font-semibold text-sm text-on-surface
                        truncate group-hover:text-primary transition-colors
                      "
                    >
                      {titleDisplay}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                      {anime.title.native}
                    </p>

                    <div className="flex items-center gap-3 mt-2">
                      {/* Episode badge */}
                      <span
                        className="
                          flex items-center gap-1
                          px-2 py-0.5 rounded-full
                          bg-primary/10 text-primary text-[11px] font-semibold
                        "
                      >
                        <span className="material-symbols-outlined text-xs">play_circle</span>
                        Ep. {episodeNum}
                      </span>

                      {/* Time */}
                      {airingAt && (
                        <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                          <span className="material-symbols-outlined text-xs">schedule</span>
                          {formatTime(airingAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Countdown / Status */}
                  <div className="flex-shrink-0 text-right">
                    {isPast ? (
                      <span
                        className="
                          px-2.5 py-1 rounded-full text-[11px] font-semibold
                          bg-emerald-500/10 text-emerald-400
                        "
                      >
                        Disponible
                      </span>
                    ) : (
                      <div>
                        <p className="text-xs text-on-surface-variant mb-1">Faltan</p>
                        <p className="text-sm font-bold text-primary tabular-nums">
                          {countdown[anime.id] || (airingAt ? formatCountdown(airingAt) : '—')}
                        </p>
                      </div>
                    )}
                    <span className="material-symbols-outlined text-on-surface-variant/30 text-base mt-2 block group-hover:text-primary/50 transition-colors">
                      chevron_right
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Summary bar ── */}
      {!loading && airingList.length > 0 && (
        <div
          className="
            flex-shrink-0 mt-3 pt-3
            border-t border-surface-container-high
            flex items-center justify-between
            text-xs text-on-surface-variant
          "
        >
          <span>
            <span className="text-primary font-semibold">{airingList.length}</span> animes en emisión
          </span>
          <span>
            Esta semana: <span className="text-primary font-semibold">
              {weekDays.reduce((acc, d) => acc + (animesByDay[d.toDateString()]?.length || 0), 0)}
            </span> episodios
          </span>
        </div>
      )}
    </div>
  );
}
