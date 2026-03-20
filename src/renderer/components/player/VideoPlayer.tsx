import React, { useRef, useState, useEffect, useCallback } from 'react';
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

  const episodeTitle = `${anime.title.english || anime.title.romaji} — Episode ${episodeNumber}`;

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

          // 4. Bloquear creación de nuevos iframes de ads
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
      onNextEpisode();
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
  }, [onNextEpisode]);

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

  // ─── Check skip times ──────────────────────────────────
  const checkSkipTimes = useCallback(
    (time: number) => {
      const op = skipTimes.find(
        (s) => s.skip_type === 'op' || s.skip_type === 'mixed-op'
      );
      const ed = skipTimes.find(
        (s) => s.skip_type === 'ed' || s.skip_type === 'mixed-ed'
      );

      setShowSkipIntro(
        !!op &&
        time >= op.interval.start_time &&
        time <= op.interval.end_time
      );
      setShowSkipOutro(
        !!ed &&
        time >= ed.interval.start_time &&
        time <= ed.interval.end_time
      );
    },
    [skipTimes]
  );

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
            document.exitFullscreen();
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
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  const handleSkipIntro = () => {
    const op = skipTimes.find(
      (s) => s.skip_type === 'op' || s.skip_type === 'mixed-op'
    );
    if (op && videoRef.current) {
      videoRef.current.currentTime = op.interval.end_time;
    }
  };

  const handleSkipOutro = () => {
    const ed = skipTimes.find(
      (s) => s.skip_type === 'ed' || s.skip_type === 'mixed-ed'
    );
    if (ed && videoRef.current) {
      videoRef.current.currentTime = ed.interval.end_time;
    }
  };

  return (
    <div
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

      {/* Buffering Spinner */}
      {isBuffering && source.type !== 'iframe' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size={48} />
        </div>
      )}

      {/* Skip Buttons */}
      {source.type !== 'iframe' && showSkipIntro && <SkipButton type="intro" onClick={handleSkipIntro} />}
      {source.type !== 'iframe' && showSkipOutro && <SkipButton type="outro" onClick={handleSkipOutro} />}

      {/* Controls or minimal back button for iframes */}
      {source.type === 'iframe' ? (
        <div className="absolute top-0 left-0 p-4 z-[90] flex items-center gap-2">
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
      )}
    </div>
  );
}
