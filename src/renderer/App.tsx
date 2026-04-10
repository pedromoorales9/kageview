import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AniListAnime, PlayMode } from '../types/types';
import { useAppStore } from '../modules/store';
import { getSkipTimes } from '../modules/aniskip';
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
import AnimeModal from './components/modals/AnimeModal';
import VideoPlayer from './components/player/VideoPlayer';
import EpisodeNotFound from './components/player/EpisodeNotFound';
import Spinner from './components/ui/Spinner';
import SplashScreen from './components/ui/SplashScreen';
import DemonOverlay from './components/ui/DemonOverlay';
import { UpdaterModal } from './components/UpdaterModal';

type PageId = 'discover' | 'oracle' | 'library' | 'search' | 'settings' | 'calendar';

interface PlayerConfig {
  anime: AniListAnime;
  episode: number;
  mode: PlayMode;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activePage, setActivePage] = useState<PageId>('discover');
  const [modalAnime, setModalAnime] = useState<AniListAnime | null>(null);
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const user = useAppStore((s) => s.user);
  const skipTimes = useAppStore((s) => s.skipTimes);
  const setSkipTimes = useAppStore((s) => s.setSkipTimes);
  const setCurrentAnime = useAppStore((s) => s.setCurrentAnime);
  const setCurrentEpisode = useAppStore((s) => s.setCurrentEpisode);

  const { initSession, saveProgress, login, getAnimeDetail } = useAniList();
  const { source, loading: sourceLoading, error: sourceError, loadSource } = useProvider();

  // Ref para acceder al source actual sin re-renders
  const sourceRef = useRef(source);
  useEffect(() => { sourceRef.current = source; }, [source]);

  // ─── Leer estado de notificaciones al montar ─────────────────
  useEffect(() => {
    if (!window.electron?.getNotificationsEnabled) return;
    window.electron.getNotificationsEnabled().then((val) => setNotificationsEnabled(val));
  }, []);

  // ─── Inicializar sesión al montar ────────────────────────
  useEffect(() => {
    initSession();

    // Escuchar OAuth code desde deep link
    if (window.electron) {
      window.electron.onOAuthCode(async (code: string) => {
        console.log('[App] OAuth code recibido:', code);
        try {
          await login(code);
        } catch (err) {
          console.error('[App] Error al iniciar sesión con OAuth:', err);
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

  const handlePlay = useCallback(
    async (episode: number, mode: PlayMode) => {
      if (!modalAnime) return;

      setPlayerConfig({ anime: modalAnime, episode, mode });
      setCurrentEpisode(episode);
      setModalAnime(null);

      // Guardar progreso en electron-store
      if (window.electron?.setWatchProgress) {
        window.electron.setWatchProgress(modalAnime.id, episode);
      }

      // Cargar source de streaming
      await loadSource(modalAnime, episode, mode);

      // Cargar skip times solo si no es iframe (fire-and-forget)
      loadSkipTimesIfNeeded(modalAnime.idMal, episode);
    },
    [modalAnime, loadSource, setCurrentEpisode, loadSkipTimesIfNeeded]
  );

  const handleExitPlayer = useCallback(() => {
    setPlayerConfig(null);
    setCurrentEpisode(null);
    setSkipTimes([]);
  }, [setCurrentEpisode, setSkipTimes]);

  const handleNextEpisode = useCallback(async () => {
    if (!playerConfig) return;
    const nextEp = playerConfig.episode + 1;

    // Guardar progreso del episodio actual en AniList
    await saveProgress(playerConfig.anime.id, playerConfig.episode);

    setPlayerConfig({ ...playerConfig, episode: nextEp });
    setCurrentEpisode(nextEp);

    // Guardar progreso local
    if (window.electron?.setWatchProgress) {
      window.electron.setWatchProgress(playerConfig.anime.id, nextEp);
    }

    await loadSource(playerConfig.anime, nextEp, playerConfig.mode);

    // Cargar skip times solo si no es iframe
    loadSkipTimesIfNeeded(playerConfig.anime.idMal, nextEp);
  }, [playerConfig, loadSource, saveProgress, setCurrentEpisode, loadSkipTimesIfNeeded]);

  const handlePrevEpisode = useCallback(async () => {
    if (!playerConfig || playerConfig.episode <= 1) return;
    const prevEp = playerConfig.episode - 1;

    setPlayerConfig({ ...playerConfig, episode: prevEp });
    setCurrentEpisode(prevEp);

    // Guardar progreso local
    if (window.electron?.setWatchProgress) {
      window.electron.setWatchProgress(playerConfig.anime.id, prevEp);
    }

    await loadSource(playerConfig.anime, prevEp, playerConfig.mode);

    // Cargar skip times solo si no es iframe
    loadSkipTimesIfNeeded(playerConfig.anime.idMal, prevEp);
  }, [playerConfig, loadSource, setCurrentEpisode, loadSkipTimesIfNeeded]);

  const handleWatchProgress = useCallback(
    (_seconds: number) => {
      // Guardar progreso local en cache (se podría expandir)
    },
    []
  );

  // ─── Render ────────────────────────────────────────────
  const isPlayerActive = playerConfig !== null && source !== null;
  const userAvatar = user?.avatar?.large || null;

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden relative">
      {/* Intro Personalizable */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Sidebar + TopBar — hidden when player is active */}
      {!isPlayerActive && (
        <>
          <Sidebar
            activePage={activePage}
            onNavigate={setActivePage}
            userAvatar={userAvatar}
          />
          <TopBar activePage={activePage} userAvatar={userAvatar} />
        </>
      )}

      {/* Main Content */}
      {!isPlayerActive && (
        <main
          className="flex-1 flex flex-col pt-20 px-6"
          style={{ marginLeft: '80px' }}
        >
          {activePage === 'discover' && (
            <DiscoverPage onSelectAnime={handleSelectAnime} />
          )}
          {activePage === 'oracle' && (
            <OraclePage onSelectAnime={handleSelectAnime} />
          )}
          {activePage === 'library' && (
            <LibraryPage onSelectAnime={handleSelectAnime} />
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
        </main>
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
          onExit={handleExitPlayer}
          onNextEpisode={handleNextEpisode}
          onPrevEpisode={handlePrevEpisode}
          onProgress={handleWatchProgress}
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

      {/* Demonio Guardián de Notificaciones */}
      <DemonOverlay
        visible={notificationsEnabled && !isPlayerActive}
        onTestNotification={() => {
          if (window.electron?.sendNotification) {
            window.electron.sendNotification({
              title: '🎌 KageView — Prueba de notificación',
              body: 'El demonio guardián está activo. ¡Te avisaré cuando salgan nuevos episodios!',
            });
          }
        }}
      />
    </div>
  );
}
