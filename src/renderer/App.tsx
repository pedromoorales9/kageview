import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AniListAnime, PlayMode, UserPreferences } from '../types/types';
import { MangaModel, MangaChapterModel } from '../modules/manga';
import { useAppStore } from '../modules/store';
import { getCache } from '../modules/cache';
import { getSkipTimes } from '../modules/aniskip';
import { recordWatch, updateWatchPosition, flushWatchPosition, ContinueWatchingItem } from '../modules/watchHistory';
import { fetchRemoteConfig, isAnnouncementUnseen, markAnnouncementSeen } from '../modules/remoteConfig';
import { evaluateAchievements } from '../modules/achievements';
import { useToast } from './components/ui/Toast';
import useAniList from './hooks/useAniList';
import useProvider from './hooks/useProvider';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import DiscoverPage from './pages/DiscoverPage';
import LibraryPage from './pages/LibraryPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import OraclePage from './pages/OraclePage';
import CalendarPage from './pages/CalendarPage';
import MangaPage from './pages/MangaPage';
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

type PageId = 'discover' | 'oracle' | 'library' | 'search' | 'settings' | 'calendar' | 'manga';

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

  const user = useAppStore((s) => s.user);
  const prefs = useAppStore((s) => s.prefs);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const skipTimes = useAppStore((s) => s.skipTimes);
  const setSkipTimes = useAppStore((s) => s.setSkipTimes);
  const setCurrentAnime = useAppStore((s) => s.setCurrentAnime);
  const setCurrentEpisode = useAppStore((s) => s.setCurrentEpisode);

  const { initSession, saveProgress, login, getAnimeDetail } = useAniList();
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

  // ─── Config remota: kill-switches y anuncios del dev ─────────
  const setRemoteConfig = useAppStore((s) => s.setRemoteConfig);
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const rc = await fetchRemoteConfig();
      if (cancelled || !rc) return;
      setRemoteConfig(rc);

      // Mostrar el anuncio si hay uno nuevo (una vez por id)
      const a = rc.announcement;
      if (a?.message && isAnnouncementUnseen(a)) {
        markAnnouncementSeen(a);
        toast.toast({
          type: a.type === 'error' ? 'error' : a.type === 'warning' ? 'warning' : 'info',
          title: a.title || '📢 Aviso de KageView',
          message: a.message,
          duration: 15000,
        });
      }
    };

    load();
    const interval = window.setInterval(load, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Inicializar sesión al montar ────────────────────────
  useEffect(() => {
    initSession();

    // Escuchar el access_token de AniList desde el deep link (implicit grant)
    if (window.electron) {
      window.electron.onOAuthCode(async (token: string) => {
        console.log('[App] Token de AniList recibido desde deep link');
        try {
          await login(token);
        } catch (err) {
          console.error('[App] Error al iniciar sesión con AniList:', err);
        }
      });
    }

    return () => {
      if (window.electron) {
        window.electron.removeOAuthListener();
      }
    };
  }, [initSession, login]);

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

  /** Actualiza la presencia de Discord con el anime/episodio en curso. */
  const updateDiscordWatching = useCallback(
    (anime: AniListAnime, episode: number) => {
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
    window.electron?.discordClear?.();
    celebrateAchievements();
  }, [setCurrentEpisode, setSkipTimes, celebrateAchievements]);

  const handleNextEpisode = useCallback(async () => {
    if (!playerConfig) return;
    const nextEp = playerConfig.episode + 1;

    // Persistir la posición del episodio que se abandona
    flushWatchPosition();

    // Guardar progreso del episodio actual en AniList
    await saveProgress(playerConfig.anime.id, playerConfig.episode);

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
  }, [playerConfig, loadSource, saveProgress, setCurrentEpisode, loadSkipTimesIfNeeded, updateDiscordWatching]);

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

  const handleWatchProgress = useCallback(
    (seconds: number, duration: number) => {
      const cfg = playerConfigRef.current;
      if (!cfg) return;
      // Guardar la posición de reproducción para "Continuar viendo"
      updateWatchPosition(cfg.anime, cfg.episode, cfg.mode, seconds, duration);
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
  const userAvatar = user?.avatar?.large || null;

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden relative">
      {/* Intro Personalizable */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Sidebar + TopBar — hidden when player or manga reader is active */}
      {!isPlayerActive && !isMangaReaderActive && (
        <>
          <Sidebar
            activePage={activePage}
            onNavigate={setActivePage}
            userAvatar={userAvatar}
          />
          <TopBar
            activePage={activePage}
            userAvatar={userAvatar}
            onOpenHistory={() => setShowHistory(true)}
          />
        </>
      )}

      {/* Main Content */}
      {!isPlayerActive && !isMangaReaderActive && (
        <main
          className="flex-1 flex flex-col pt-20 px-6"
          style={{ marginLeft: '80px' }}
        >
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
          {activePage === 'settings' && <SettingsPage />}
          {activePage === 'manga' && (
            <MangaPage onSelectManga={handleSelectManga} />
          )}
        </main>
      )}

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

      {/* Actualizador Modal Global */}
      <UpdaterModal />

      {/* Demonio Guardián — mascota de notificaciones y logros */}
      <DemonOverlay
        visible={
          !playerConfig && !isMangaReaderActive &&
          !modalAnime && !mangaModal && !showHistory && !showAchievements
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
