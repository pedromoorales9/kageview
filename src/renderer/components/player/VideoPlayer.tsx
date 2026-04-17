import React, { useRef, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import Hls from 'hls.js';
import { AniListAnime, StreamingSource, SkipTime, PlayMode } from '../../../types/types';
import PlayerControls from './PlayerControls';
import SkipButton from './SkipButton';
import Spinner from '../ui/Spinner';

interface VideoPlayerProps {
  anime: AniListAnime;
  episodeNumber: number;
  source: StreamingSource;
  skipTimes: SkipTime[];
  onExit: () => void;
  onNextEpisode: () => void;
  onPrevEpisode: () => void;
  onProgress: (seconds: number) => void;
}

export default function VideoPlayer({
  anime,
  episodeNumber,
  source,
  skipTimes,
  onExit,
  onNextEpisode,
  onPrevEpisode,
  onProgress,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const webviewRef = useRef<any>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isBuffering, setIsBuffering] = useState(source.type !== 'iframe');
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const hasNextEpisode = !anime.episodes || episodeNumber < anime.episodes;

  const episodeTitle = `${anime.title.english || anime.title.romaji} — Episode ${episodeNumber}`;

  // ─── Sincronizar fullscreen desde el main process ────────
  useEffect(() => {
    window.electron?.windowControls?.onFullscreenChanged((value) => setIsFullscreen(value));
    return () => window.electron?.windowControls?.removeFullscreenListener();
  }, []);

  // ─── Inyectar ad-blocker en webview ─────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || source.type !== 'iframe') return;

    const onDomReady = () => {
      // Inyectar script para bloquear publicidad
      wv.executeJavaScript(`
        (function() {
          // 1. Bloquear window.open completamente
          window.open = function() { return null; };

          // 2. Bloquear popups vía eventos
          document.addEventListener('click', function(e) {
            const a = e.target.closest('a');
            if (a && a.target === '_blank') {
              e.preventDefault();
              e.stopPropagation();
            }
          }, true);

          // 3. Selectores comunes de overlays/banners publicitarios
          const adSelectors = [
            'iframe[src*="ad"]', 'iframe[src*="pop"]', 'iframe[src*="banner"]',
            'div[class*="ad-"]', 'div[class*="ads-"]', 'div[class*="popup"]',
            'div[class*="overlay"]', 'div[id*="ad-"]', 'div[id*="ads-"]',
            'div[id*="popup"]', 'div[class*="banner"]',
            'a[target="_blank"]', '.pop-up', '#overlay',
            'div[style*="z-index: 9999"]', 'div[style*="z-index:9999"]',
            'div[style*="z-index: 99999"]', 'div[style*="z-index:99999"]',
          ];

          function removeAds() {
            adSelectors.forEach(function(sel) {
              document.querySelectorAll(sel).forEach(function(el) {
                // No borrar el video principal ni su contenedor
                if (el.tagName === 'IFRAME' && el.closest('.jw-media, .plyr, .video-js, #player')) return;
                if (el.tagName === 'DIV' && el.querySelector('video, .jw-media, .plyr')) return;
                el.remove();
              });
            });
          }

          // Ejecutar inmediatamente y con observer
          removeAds();
          var observer = new MutationObserver(function() { removeAds(); });
          observer.observe(document.body, { childList: true, subtree: true });

          // 4. Bloquear requestFullscreen completamente — el fullscreen lo maneja la app
          Element.prototype.requestFullscreen = function() { return Promise.resolve(); };
          document.exitFullscreen = function() { return Promise.resolve(); };

          // Propagar el bloqueo a iframes internos del player cuando se carguen
          document.addEventListener('load', function(e) {
            var el = e.target;
            if (el && el.tagName === 'IFRAME') {
              try {
                var win = el.contentWindow;
                if (win) win.Element.prototype.requestFullscreen = function() { return Promise.resolve(); };
              } catch (_) {}
            }
          }, true);

          // 5. Bloquear creación de nuevos iframes de ads
          var origCreate = document.createElement.bind(document);
          document.createElement = function(tag) {
            var el = origCreate(tag);
            if (tag.toLowerCase() === 'iframe') {
              var origSetAttr = el.setAttribute.bind(el);
              el.setAttribute = function(name, value) {
                if (name === 'src' && typeof value === 'string') {
                  var low = value.toLowerCase();
                  if (low.includes('ad') || low.includes('pop') || low.includes('banner') ||
                      low.includes('track') || low.includes('click')) {
                    return;
                  }
                }
                origSetAttr(name, value);
              };
            }
            return el;
          };
        })();
      `).catch(() => {});
    };

    wv.addEventListener('dom-ready', onDomReady);
    return () => {
      wv.removeEventListener('dom-ready', onDomReady);
    };
  }, [source]);

  // ─── Inicializar HLS o MP4 ──────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (source.type === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hls.loadSource(source.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => { });
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[VideoPlayer] HLS fatal error:', data);
          hls.destroy();
        }
      });
      hlsRef.current = hls;
    } else {
      video.src = source.url;
      video.play().catch(() => { });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [source]);

  // ─── Check skip times ──────────────────────────────────
  const checkSkipTimes = useCallback(
    (time: number) => {
      const op = skipTimes.find(
        (s) => s.skipType === 'op' || s.skipType === 'mixed-op'
      );
      const ed = skipTimes.find(
        (s) => s.skipType === 'ed' || s.skipType === 'mixed-ed'
      );

      setShowSkipIntro(
        !!op &&
        time >= op.interval.startTime &&
        time <= op.interval.endTime
      );
      setShowSkipOutro(
        !!ed &&
        time >= ed.interval.startTime &&
        time <= ed.interval.endTime
      );
    },
    [skipTimes]
  );

  // ─── Countdown siguiente episodio ─────────────────────
  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startCountdown = useCallback(() => {
    if (!hasNextEpisode) return;
    if (countdownRef.current !== null) return; // ya corriendo
    setCountdown(5);
    countdownRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [hasNextEpisode]);

  // Cuando countdown llega a 0 lanzamos siguiente episodio
  useEffect(() => {
    if (countdown === 0) {
      cancelCountdown();
      onNextEpisode();
    }
  }, [countdown, cancelCountdown, onNextEpisode]);

  // Limpiar countdown al desmontar
  useEffect(() => () => cancelCountdown(), [cancelCountdown]);

  // ─── Event listeners del video ──────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      checkSkipTimes(video.currentTime);
    };
    const onDurationChange = () => setDuration(video.duration);
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onEnded = () => {
      startCountdown();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('ended', onEnded);
    };
  }, [startCountdown, checkSkipTimes]);

  // ─── Guardar progreso cada 5s ───────────────────────────
  useEffect(() => {
    progressTimerRef.current = window.setInterval(() => {
      if (videoRef.current) {
        onProgress(videoRef.current.currentTime);
      }
    }, 5000);
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, [onProgress]);

  // ─── Polling de tiempo para webview (iframe) ──────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || source.type !== 'iframe') return;

    let wasEnded = false;
    const interval = window.setInterval(async () => {
      try {
        const result = await wv.executeJavaScript(
          'var v = document.querySelector("video"); v ? JSON.stringify({t: v.currentTime, ended: v.ended}) : null'
        );
        if (typeof result === 'string') {
          const { t, ended } = JSON.parse(result);
          if (t >= 0) {
            setCurrentTime(t);
            checkSkipTimes(t);
          }
          if (ended && !wasEnded) startCountdown();
          wasEnded = ended;
        }
      } catch {
        // webview aún no está listo
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [source, checkSkipTimes, startCountdown]);

  // ─── Ocultar controles tras 3s ─────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 3000);
  }, [isPlaying]);

  // ─── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          showControls();
          break;
        case 'ArrowLeft':
          video.currentTime = Math.max(0, video.currentTime - 5);
          showControls();
          break;
        case 'ArrowRight':
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          showControls();
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.1));
          showControls();
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.1));
          showControls();
          break;
        case 'f':
        case 'F':
        case 'F11':
          handleFullscreen();
          break;
        case 'm':
        case 'M':
          handleMute();
          showControls();
          break;
        case 'Escape':
          if (isFullscreen) {
            window.electron?.windowControls?.setFullscreen(false);
            setIsFullscreen(false);
          } else {
            onExit();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [volume, isPlaying, isFullscreen, showControls, onExit]);

  // ─── Handlers ──────────────────────────────────────────
  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  };

  const handleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    setVolume(v);
    if (v > 0 && isMuted) {
      video.muted = false;
      setIsMuted(false);
    }
  };

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  };

  const handleFullscreen = () => {
    const next = !isFullscreen;
    window.electron?.windowControls?.setFullscreen(next);
    setIsFullscreen(next);
  };

  const handleSkipIntro = () => {
    const op = skipTimes.find(
      (s) => s.skipType === 'op' || s.skipType === 'mixed-op'
    );
    if (!op) return;
    if (source.type === 'iframe') {
      webviewRef.current?.executeJavaScript(
        `var v = document.querySelector("video"); if(v) v.currentTime = ${op.interval.endTime};`
      ).catch(() => {});
    } else if (videoRef.current) {
      videoRef.current.currentTime = op.interval.endTime;
    }
  };

  const handleSkipOutro = () => {
    const ed = skipTimes.find(
      (s) => s.skipType === 'ed' || s.skipType === 'mixed-ed'
    );
    if (!ed) return;
    if (source.type === 'iframe') {
      webviewRef.current?.executeJavaScript(
        `var v = document.querySelector("video"); if(v) v.currentTime = ${ed.interval.endTime};`
      ).catch(() => {});
    } else if (videoRef.current) {
      videoRef.current.currentTime = ed.interval.endTime;
    }
  };

  return (
    <>
    <div
      ref={playerRef}
      id="video-player"
      className="fixed inset-0 z-[80] bg-black flex items-center justify-center"
      onMouseMove={showControls}
      onClick={showControls}
    >
      {/* Webview Element for external providers */}
      {source.type === 'iframe' ? (
        React.createElement('webview', {
          ref: webviewRef,
          src: source.url,
          className: 'w-full h-full bg-black border-0',
          webpreferences: 'contextIsolation=no, javascript=yes'
        })
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
        />
      )}

    </div>,

    // Portal: todos los overlays se montan en document.body, fuera del webview
    ReactDOM.createPortal(
      <div className="fixed inset-0 z-[200] pointer-events-none">
        {/* Buffering Spinner */}
        {isBuffering && source.type !== 'iframe' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Spinner size={48} />
          </div>
        )}

        {/* Skip Buttons */}
        {showSkipIntro && (
          <div className="pointer-events-auto">
            <SkipButton type="intro" onClick={handleSkipIntro} />
          </div>
        )}
        {showSkipOutro && (
          <div className="pointer-events-auto">
            <SkipButton type="outro" onClick={handleSkipOutro} />
          </div>
        )}

        {/* Countdown siguiente episodio */}
        {countdown !== null && (
          <div className="absolute top-0 left-0 right-0 flex justify-center pt-4">
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 animate-fade-in">
              <span className="text-white/50 text-xs font-label">Siguiente en</span>
              <span className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-primary font-bold text-xs">
                {countdown}
              </span>
              <button
                onClick={() => { cancelCountdown(); onNextEpisode(); }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/20 border border-primary/40 text-white font-headline font-semibold text-xs hover:bg-primary/30 transition-all"
              >
                <span className="material-symbols-outlined text-primary text-base">skip_next</span>
                Ep. {episodeNumber + 1}
              </button>
              <button
                onClick={cancelCountdown}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Controls or minimal back button for iframes */}
        {source.type === 'iframe' ? (
          <div className="absolute top-0 left-0 p-4 flex items-center gap-2 pointer-events-auto">
            <button
              onClick={onExit}
              className="w-10 h-10 rounded-lg bg-black/60 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white transition-all hover:bg-black/90 shadow-lg"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <button
              onClick={onNextEpisode}
              className="w-10 h-10 rounded-lg bg-black/60 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white transition-all hover:bg-black/90 shadow-lg"
            >
              <span className="material-symbols-outlined">skip_next</span>
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto absolute inset-0">
            <PlayerControls
              isPlaying={isPlaying}
              isMuted={isMuted}
              isFullscreen={isFullscreen}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              episodeTitle={episodeTitle}
              visible={controlsVisible}
              onPlayPause={handlePlayPause}
              onMute={handleMute}
              onVolumeChange={handleVolumeChange}
              onSeek={handleSeek}
              onPrevEpisode={onPrevEpisode}
              onNextEpisode={onNextEpisode}
              onFullscreen={handleFullscreen}
              onExit={onExit}
            />
          </div>
        )}
      </div>,
      document.body
    )
    </>
  );
}
