import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AniListAnime, PlayMode, UserPreferences } from '../types/types';
import { MangaModel, MangaChapterModel } from '../modules/manga';
import { useAppStore } from '../modules/store';
import { getCache } from '../modules/cache';
import { getSkipTimes } from '../modules/aniskip';
import { recordWatch, updateWatchPosition, flushWatchPosition, ContinueWatchingItem } from '../modules/watchHistory';
import { REMOTE_CONFIG_REFRESH_MS, refreshRemoteConfig } from '../modules/remoteConfig';
import { evaluateAchievements } from '../modules/achievements';
import { initAccount } from '../modules/account';
import { markStarted, saveProgress as saveListProgress } from '../modules/library';
import { startWatching, stopWatching } from '../modules/presence';
import { NOTICE_EVENT, Notice } from '../modules/notify';
import { useToast } from './components/ui/Toast';
import useAniList from './hooks/useAniList';
import useProvider from './hooks/useProvider';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import DiscoverPage from './pages/DiscoverPage';
import LibraryPage from './pages/LibraryPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import { AnnouncementBanner, AnnouncementModal } from './components/announcements/AnnouncementLayer';
import OraclePage from './pages/OraclePage';
import CalendarPage from './pages/CalendarPage';
import MangaPage from './pages/MangaPage';
import FriendsPage from './pages/FriendsPage';
import AuthModal from './components/account/AuthModal';
import ProfileModal from './components/account/ProfileModal';
import AnimeModal from './components/modals/AnimeModal';
import HistoryModal from './components/modals/HistoryModal';
import AchievementsModal from './components/modals/AchievementsModal';
import MangaModal from './components/manga/MangaModal';
import MangaReader from './components/manga/MangaReader';
import VideoPlayer from './components/player/VideoPlayer';
import EpisodeNotFound from './components/player/EpisodeNotFound';
import Spinner from './components/ui/Spinner';
import SplashScreen from './components/ui/SplashScreen';
import DemonOverlay from './components/ui/DemonOverlay';
import { UpdaterModal } from './components/UpdaterModal';

type PageId = 'discover' | 'oracle' | 'library' | 'search' | 'settings' | 'calendar' | 'manga' | 'friends' | 'admin';

interface MangaReaderConfig {
  manga: MangaModel;
  chapters: MangaChapterModel[];
  chapterIndex: number;
}

interface PlayerConfig {
  anime: AniListAnime;
  episode: number;
  mode: PlayMode;
  /** Segundo desde el que reanudar al cargar (Continuar viendo). */
  startAt?: number;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activePage, setActivePage] = useState<PageId>('discover');
  const [modalAnime, setModalAnime] = useState<AniListAnime | null>(null);
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);

  // Manga state
  const [mangaModal, setMangaModal] = useState<MangaModel | null>(null);
  const [mangaReaderConfig, setMangaReaderConfig] = useState<MangaReaderConfig | null>(null);

  const authModalOpen = useAppStore((s) => s.authModal !== null);
  const profileModalOpen = useAppStore((s) => s.profileModalOpen);
  const prefs = useAppStore((s) => s.prefs);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const skipTimes = useAppStore((s) => s.skipTimes);
  const setSkipTimes = useAppStore((s) => s.setSkipTimes);
  const setCurrentAnime = useAppStore((s) => s.setCurrentAnime);
  const setCurrentEpisode = useAppStore((s) => s.setCurrentEpisode);

  const { getAnimeDetail } = useAniList();
  const { source, loading: sourceLoading, error: sourceError, loadSource, tryNextSource } = useProvider();
  const toast = useToast();

  // Evalúa logros y celebra los recién desbloqueados con un toast del demonio
  const celebrateAchievements = useCallback(async () => {
    try {
      const newly = await evaluateAchievements();
      newly.forEach((a) => {
        toast.toast({
          type: 'success',
          title: '👹 ¡Logro desbloqueado!',
          message: a.title,
          duration: 6000,
        });
      });
    } catch { /* noop */ }
  }, [toast]);

  // Ref para acceder al source actual sin re-renders
  const sourceRef = useRef(source);
  useEffect(() => { sourceRef.current = source; }, [source]);

  // Ref al playerConfig para que el callback de progreso sea estable
  const playerConfigRef = useRef(playerConfig);
  useEffect(() => { playerConfigRef.current = playerConfig; }, [playerConfig]);

  // ─── Leer estado de notificaciones al montar ─────────────────
  useEffect(() => {
    if (!window.electron?.getNotificationsEnabled) return;
    window.electron.getNotificationsEnabled().then((val) => setNotificationsEnabled(val));
  }, []);

  // ─── Restaurar preferencias persistidas al montar ────────────
  useEffect(() => {
    (async () => {
      const saved = await getCache<Partial<UserPreferences>>('userPrefs');
      if (saved) setPrefs(saved);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Persistir logros ya merecidos al arrancar (sin toasts) ───
  useEffect(() => {
    evaluateAchievements().catch(() => { /* noop */ });
  }, []);

  // ─── Config remota: anuncios y servicios desactivados por el equipo ─────
  // (Supabase; se lee sin sesión. Los avisos los pinta <AnnouncementLayer/>.)
  useEffect(() => {
    let last = 0;
    const load = () => {
      last = Date.now();
      void refreshRemoteConfig();
    };
    // Al volver a la ventana, si hace más de un minuto de la última consulta
    const onFocus = () => { if (Date.now() - last > 60_000) load(); };

    load();
    const interval = window.setInterval(load, REMOTE_CONFIG_REFRESH_MS);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // ─── Inicializar la cuenta (Supabase) al montar ──────────
  useEffect(() => {
    initAccount();

    // Avisos que emite la lógica fuera de React (listas, enlaces del correo…)
    const onNotice = (e: Event) => {
      const n = (e as CustomEvent<Notice>).detail;
      if (n) toast[n.type](n.message, n.title);
    };
    window.addEventListener(NOTICE_EVENT, onNotice);
    return () => {
      window.removeEventListener(NOTICE_EVENT, onNotice);
      window.electron?.removeAuthCallbackListener?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // No interceptar si el player está activo (lo maneja VideoPlayer)
      if (playerConfig) return;

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          setActivePage('discover');
          break;
        case 'F2':
          e.preventDefault();
          setActivePage('library');
          break;
        case 'F3':
          e.preventDefault();
          setActivePage('search');
          break;
        case 'Escape':
          if (modalAnime) setModalAnime(null);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [playerConfig, modalAnime]);

  // ─── Handlers ──────────────────────────────────────────
  const handleSelectAnime = useCallback((anime: AniListAnime) => {
    setModalAnime(anime);
    setCurrentAnime(anime);
  }, [setCurrentAnime]);

  const handleCloseModal = useCallback(() => {
    setModalAnime(null);
    setCurrentAnime(null);
  }, [setCurrentAnime]);

  /**
   * Carga skip times de AniSkip solo si el source resuelto NO es iframe.
   * En modo iframe no controlamos el reproductor, así que es inútil.
   * Se ejecuta como fire-and-forget para no bloquear la carga del episodio.
   */
  const loadSkipTimesIfNeeded = useCallback(
    async (malId: number | null, episode: number) => {
      // Sin MAL ID no podemos consultar AniSkip
      if (!malId) {
        setSkipTimes([]);
        return;
      }

      try {
        const times = await getSkipTimes(malId, episode, 0);
        setSkipTimes(times);
      } catch {
        setSkipTimes([]);
      }
    },
    [setSkipTimes]
  );

  /**
   * Se llama al empezar CUALQUIER episodio (play, siguiente, anterior,
   * reanudar): actualiza Discord, publica "viendo ahora" para tus amigos y
   * asegura que el anime figure como "Viendo" en tu lista.
   */
  const updateDiscordWatching = useCallback(
    (anime: AniListAnime, episode: number) => {
      startWatching(anime, episode);
      markStarted(anime, episode).catch(() => { /* ya se avisó al usuario */ });
      if (!prefs.discordRpc) return;
      window.electron?.discordSetActivity?.({
        details: anime.title.english || anime.title.romaji,
        state: `Episodio ${episode}`,
      });
    },
    [prefs.discordRpc]
  );

  const handlePlay = useCallback(
    async (episode: number, mode: PlayMode) => {
      if (!modalAnime) return;

      setPlayerConfig({ anime: modalAnime, episode, mode });
      setCurrentEpisode(episode);
      setModalAnime(null);
      updateDiscordWatching(modalAnime, episode);

      // Guardar progreso en electron-store
      if (window.electron?.setWatchProgress) {
        window.electron.setWatchProgress(modalAnime.id, episode);
      }

      // Registrar en el historial de visualización
      recordWatch(modalAnime, episode, mode);

      // Cargar source de streaming
      await loadSource(modalAnime, episode, mode);

      // Cargar skip times solo si no es iframe (fire-and-forget)
      loadSkipTimesIfNeeded(modalAnime.idMal, episode);
    },
    [modalAnime, loadSource, setCurrentEpisode, loadSkipTimesIfNeeded, updateDiscordWatching]
  );

  const handleExitPlayer = useCallback(() => {
    // Persistir la última posición pendiente antes de cerrar el player
    flushWatchPosition();
    setPlayerConfig(null);
    setCurrentEpisode(null);
    setSkipTimes([]);
    stopWatching();
    window.electron?.discordClear?.();
    celebrateAchievements();
  }, [setCurrentEpisode, setSkipTimes, celebrateAchievements]);

  const handleNextEpisode = useCallback(async () => {
    if (!playerConfig) return;
    const nextEp = playerConfig.episode + 1;

    // Persistir la posición del episodio que se abandona
    flushWatchPosition();

    // Guardar progreso del episodio actual en mi lista (sin bloquear la carga)
    saveListProgress(playerConfig.anime, playerConfig.episode).catch(() => { /* ya se avisó */ });

    setPlayerConfig({ ...playerConfig, episode: nextEp, startAt: undefined });
    setCurrentEpisode(nextEp);
    updateDiscordWatching(playerConfig.anime, nextEp);

    // Guardar progreso local
    if (window.electron?.setWatchProgress) {
      window.electron.setWatchProgress(playerConfig.anime.id, nextEp);
    }

    // Registrar en el historial de visualización
    recordWatch(playerConfig.anime, nextEp, playerConfig.mode);

    await loadSource(playerConfig.anime, nextEp, playerConfig.mode);

    // Cargar skip times solo si no es iframe
    loadSkipTimesIfNeeded(playerConfig.anime.idMal, nextEp);
  }, [playerConfig, loadSource, setCurrentEpisode, loadSkipTimesIfNeeded, updateDiscordWatching]);

  const handlePrevEpisode = useCallback(async () => {
    if (!playerConfig || playerConfig.episode <= 1) return;
    const prevEp = playerConfig.episode - 1;

    // Persistir la posición del episodio que se abandona
    flushWatchPosition();

    setPlayerConfig({ ...playerConfig, episode: prevEp, startAt: undefined });
    setCurrentEpisode(prevEp);
    updateDiscordWatching(playerConfig.anime, prevEp);

    // Guardar progreso local
    if (window.electron?.setWatchProgress) {
      window.electron.setWatchProgress(playerConfig.anime.id, prevEp);
    }

    // Registrar en el historial de visualización
    recordWatch(playerConfig.anime, prevEp, playerConfig.mode);

    await loadSource(playerConfig.anime, prevEp, playerConfig.mode);

    // Cargar skip times solo si no es iframe
    loadSkipTimesIfNeeded(playerConfig.anime.idMal, prevEp);
  }, [playerConfig, loadSource, setCurrentEpisode, loadSkipTimesIfNeeded, updateDiscordWatching]);

  // El servidor embed actual no reproduce (p. ej. "Content not found"):
  // saltar al siguiente servidor; si no quedan, useProvider pone el error
  // y se muestra la pantalla de episodio no encontrado.
  const handleSourceFailed = useCallback(() => {
    const advanced = tryNextSource();
    if (advanced) {
      toast.info('Ese servidor no funciona, probando el siguiente…', 'Cambiando de servidor');
    }
  }, [tryNextSource, toast]);

  // Episodio ya marcado como visto en mi lista (evita repetir la petición)
  const watchedMarkRef = useRef<string | null>(null);

  const handleWatchProgress = useCallback(
    (seconds: number, duration: number) => {
      const cfg = playerConfigRef.current;
      if (!cfg) return;
      // Guardar la posición de reproducción para "Continuar viendo"
      updateWatchPosition(cfg.anime, cfg.episode, cfg.mode, seconds, duration);

      // Al pasar el 80 % del episodio cuenta como visto en mi lista
      if (duration > 0 && seconds / duration >= 0.8) {
        const key = `${cfg.anime.id}:${cfg.episode}`;
        if (watchedMarkRef.current !== key) {
          watchedMarkRef.current = key;
          saveListProgress(cfg.anime, cfg.episode).catch(() => { watchedMarkRef.current = null; });
        }
      }
    },
    []
  );

  const handleResume = useCallback(
    async (item: ContinueWatchingItem) => {
      setModalAnime(null);
      setPlayerConfig({
        anime: item.anime,
        episode: item.episode,
        mode: item.mode,
        startAt: item.resumeSeconds,
      });
      setCurrentAnime(item.anime);
      setCurrentEpisode(item.episode);

      if (window.electron?.setWatchProgress) {
        window.electron.setWatchProgress(item.anime.id, item.episode);
      }

      // recordWatch conserva la posición previa, así que no borra el reanudado
      recordWatch(item.anime, item.episode, item.mode);

      await loadSource(item.anime, item.episode, item.mode);
      loadSkipTimesIfNeeded(item.anime.idMal, item.episode);
    },
    [loadSource, setCurrentAnime, setCurrentEpisode, loadSkipTimesIfNeeded]
  );

  // ─── Manga handlers ───────────────────────────────────
  const handleSelectManga = useCallback((manga: MangaModel) => {
    setMangaModal(manga);
  }, []);

  const handleReadChapter = useCallback(
    (chapterIndex: number, chapters: MangaChapterModel[]) => {
      if (!mangaModal) return;
      setMangaReaderConfig({ manga: mangaModal, chapters, chapterIndex });
      setMangaModal(null);
    },
    [mangaModal]
  );

  const handleExitMangaReader = useCallback(() => {
    setMangaReaderConfig(null);
    celebrateAchievements();
  }, [celebrateAchievements]);

  // ─── Render ────────────────────────────────────────────
  const isPlayerActive = playerConfig !== null && source !== null;
  const isMangaReaderActive = mangaReaderConfig !== null;
  // Sidebar + barra superior visibles (no en reproductor ni lector de manga)
  const showChrome = !isPlayerActive && !isMangaReaderActive;

  return (
    <div className="flex h-screen w-screen overflow-hidden relative">
      {/* Fondo ambiental opaco (luna de sangre). En macOS deja libre la
          zona del sidebar para que se vea el vibrancy nativo. */}
      <div
        aria-hidden
        className="app-ambient fixed inset-y-0 right-0 pointer-events-none"
        style={{ left: showChrome ? '232px' : 0 }}
      />

      {/* Intro Personalizable */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Sidebar + TopBar — hidden when player or manga reader is active */}
      {!isPlayerActive && !isMangaReaderActive && (
        <>
          <Sidebar
            activePage={activePage}
            onNavigate={setActivePage}
          />
          <TopBar
            activePage={activePage}
            onOpenHistory={() => setShowHistory(true)}
            onNavigate={setActivePage}
          />
        </>
      )}

      {/* Main Content */}
      {!isPlayerActive && !isMangaReaderActive && (
        <main
          className="relative flex-1 min-w-0 flex flex-col pt-[68px] px-8"
          style={{ marginLeft: '232px' }}
        >
          <AnnouncementBanner />
          {activePage === 'discover' && (
            <DiscoverPage onSelectAnime={handleSelectAnime} onResume={handleResume} />
          )}
          {activePage === 'oracle' && (
            <OraclePage onSelectAnime={handleSelectAnime} />
          )}
          {activePage === 'library' && (
            <LibraryPage onSelectAnime={handleSelectAnime} onSelectManga={handleSelectManga} />
          )}
          {activePage === 'search' && (
            <SearchPage onSelectAnime={handleSelectAnime} />
          )}
          {activePage === 'calendar' && (
            <CalendarPage
              onSelectAnime={handleSelectAnime}
              onNotificationsChange={(val) => setNotificationsEnabled(val)}
            />
          )}
          {activePage === 'settings' && <SettingsPage onOpenAdmin={() => setActivePage('admin')} />}
          {activePage === 'manga' && (
            <MangaPage onSelectManga={handleSelectManga} />
          )}
          {activePage === 'friends' && <FriendsPage onSelectAnime={handleSelectAnime} />}
          {activePage === 'admin' && <AdminPage />}
        </main>
      )}

      {/* Anuncios en ventana: solo con la interfaz visible y sin la intro */}
      <AnnouncementModal enabled={showChrome && !showSplash} />

      {/* Manga Modal */}
      {mangaModal && (
        <MangaModal
          manga={mangaModal}
          onClose={() => setMangaModal(null)}
          onReadChapter={handleReadChapter}
        />
      )}

      {/* Manga Reader — fullscreen */}
      {isMangaReaderActive && (
        <MangaReader
          manga={mangaReaderConfig!.manga}
          chapters={mangaReaderConfig!.chapters}
          initialChapterIndex={mangaReaderConfig!.chapterIndex}
          onExit={handleExitMangaReader}
        />
      )}

      {/* Anime Modal */}
      {modalAnime && (
        <AnimeModal
          anime={modalAnime}
          onClose={handleCloseModal}
          onPlay={handlePlay}
          onSelectRelation={async (animeId) => {
            try {
              const detail = await getAnimeDetail(animeId);
              handleSelectAnime(detail);
            } catch (err) {
              console.error('[App] Error cargando relación:', err);
            }
          }}
        />
      )}

      {/* History Modal */}
      {showHistory && (
        <HistoryModal
          onClose={() => setShowHistory(false)}
          onSelectAnime={handleSelectAnime}
        />
      )}

      {/* Loading overlay when fetching stream */}
      {playerConfig && sourceLoading && (
        <div className="fixed inset-0 z-[75] bg-background/90 flex flex-col items-center justify-center gap-4">
          <Spinner size={40} />
          <p className="text-sm text-on-surface-variant font-label">
            Loading stream...
          </p>
        </div>
      )}

      {/* Video Player — fullscreen overlay */}
      {isPlayerActive && (
        <VideoPlayer
          anime={playerConfig.anime}
          episodeNumber={playerConfig.episode}
          source={source}
          skipTimes={skipTimes}
          startAt={playerConfig.startAt}
          onExit={handleExitPlayer}
          onNextEpisode={handleNextEpisode}
          onPrevEpisode={handlePrevEpisode}
          onProgress={handleWatchProgress}
          onSourceFailed={handleSourceFailed}
        />
      )}

      {/* Episode Not Found Screen */}
      {playerConfig && sourceError && !sourceLoading && (
        <EpisodeNotFound
          episodeNumber={playerConfig.episode}
          onBack={handleExitPlayer}
          onNextEpisode={handleNextEpisode}
        />
      )}

      {/* Cuenta: acceso / registro y perfil */}
      <AuthModal />
      <ProfileModal />

      {/* Actualizador Modal Global */}
      <UpdaterModal />

      {/* Demonio Guardián — mascota de notificaciones y logros */}
      <DemonOverlay
        visible={
          !playerConfig && !isMangaReaderActive &&
          !modalAnime && !mangaModal && !showHistory && !showAchievements &&
          !authModalOpen && !profileModalOpen
        }
        notificationsEnabled={notificationsEnabled}
        onOpenAchievements={() => setShowAchievements(true)}
        onTestNotification={() => {
          if (window.electron?.sendNotification) {
            window.electron.sendNotification({
              title: '🎌 KageView — Prueba de notificación',
              body: 'El demonio guardián está activo. ¡Te avisaré cuando salgan nuevos episodios!',
            });
          }
        }}
      />

      {/* Modal de Logros */}
      {showAchievements && (
        <AchievementsModal onClose={() => setShowAchievements(false)} />
      )}
    </div>
  );
}
