import React from 'react';

interface PlayerControlsProps {
  isPlaying: boolean;
  isMuted: boolean;
  isFullscreen: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  episodeTitle: string;
  visible: boolean;
  onPlayPause: () => void;
  onMute: () => void;
  onVolumeChange: (vol: number) => void;
  onSeek: (time: number) => void;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  onFullscreen: () => void;
  onExit: () => void;
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlayerControls({
  isPlaying,
  isMuted,
  isFullscreen,
  currentTime,
  duration,
  volume,
  episodeTitle,
  visible,
  onPlayPause,
  onMute,
  onVolumeChange,
  onSeek,
  onPrevEpisode,
  onNextEpisode,
  onFullscreen,
  onExit,
}: PlayerControlsProps) {
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    // Capa raíz a pantalla completa, transparente a clics: los clics sobre el
    // vídeo los captura el wrapper del reproductor (pausa/reanuda); solo el
    // botón de volver y la barra inferior son interactivos.
    <div
      className={`
        absolute inset-0 z-[82]
        transition-opacity duration-300
        ${visible ? 'opacity-100' : 'opacity-0'}
        pointer-events-none
      `}
    >
      {/* Botón volver — arriba a la izquierda de la pantalla */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
        <button
          onClick={(e) => { e.stopPropagation(); onExit(); }}
          className={`
            w-10 h-10 rounded-lg bg-black/60 flex items-center justify-center
            text-white/80 hover:text-white transition-colors shadow-lg
            ${visible ? 'pointer-events-auto' : ''}
          `}
          title="Volver"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      {/* Floating Controls Pill */}
      <div
        className={`absolute inset-x-0 bottom-8 flex justify-center ${visible ? 'pointer-events-auto' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-[90%] max-w-4xl bg-black/65 border border-white/10 rounded-[24px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-3 transition-transform duration-300">
          
          {/* Top Row: Info & Times */}
          <div className="flex items-center justify-between px-2">
            <span className="text-xs text-white/60 font-body font-medium w-16 text-left">
              {formatTime(currentTime)}
            </span>
            
            <span className="text-sm text-white font-headline font-semibold tracking-wide truncate flex-1 text-center px-4 drop-shadow-md">
              {episodeTitle}
            </span>
            
            <span className="text-xs text-white/60 font-body font-medium w-16 text-right">
              {formatTime(duration)}
            </span>
          </div>

          {/* Progress Bar */}
          <div
            className="group relative w-full h-1.5 bg-white/10 rounded-full cursor-pointer hover:h-2 transition-all my-1"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const pct = x / rect.width;
              onSeek(pct * duration);
            }}
          >
            <div
              className="absolute left-0 top-0 h-full bg-primary rounded-full shadow-[0_0_12px_rgba(255, 61, 90,0.8)]"
              style={{ width: `${progressPercent}%` }}
            >
              {/* Thumb */}
              <div className="
                absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2
                w-3 h-3 rounded-full bg-white
                opacity-0 group-hover:opacity-100
                shadow-[0_0_10px_rgba(255,255,255,0.8)]
                transition-all duration-200
                group-hover:scale-125
              " />
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between px-2 mt-1">
            
            {/* Left: Volume */}
            <div className="flex items-center gap-2 group/vol w-32">
              <button
                onClick={onMute}
                className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors hover:scale-110"
              >
                <span className="material-symbols-outlined text-xl">
                  {isMuted || volume === 0
                    ? 'volume_off'
                    : volume < 0.5
                    ? 'volume_down'
                    : 'volume_up'}
                </span>
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="
                  w-0 group-hover/vol:w-20
                  opacity-0 group-hover/vol:opacity-100
                  transition-all duration-300 ease-out
                  h-1 appearance-none bg-white/20 rounded-full cursor-pointer
                  accent-primary
                "
              />
            </div>

            {/* Center: Playback */}
            <div className="flex items-center gap-6">
              <button
                onClick={onPrevEpisode}
                className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:scale-110 transition-all"
              >
                <span className="material-symbols-outlined text-3xl">skip_previous</span>
              </button>

              <button
                onClick={onPlayPause}
                className="
                  w-14 h-14 rounded-full bg-white flex items-center justify-center
                  text-black hover:scale-110 transition-all duration-300
                  shadow-[0_0_20px_rgba(255,255,255,0.2)]
                  hover:shadow-[0_0_30px_rgba(255,255,255,0.4)]
                "
              >
                <span className="material-symbols-outlined filled text-4xl">
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>

              <button
                onClick={onNextEpisode}
                className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:scale-110 transition-all"
              >
                <span className="material-symbols-outlined text-3xl">skip_next</span>
              </button>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1 w-32 justify-end">
              <button className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:scale-110 transition-all">
                <span className="material-symbols-outlined text-[22px]">subtitles</span>
              </button>

              <button className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:scale-110 transition-all">
                <span className="material-symbols-outlined text-[22px]">settings</span>
              </button>

              <button
                onClick={onFullscreen}
                className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:scale-110 transition-all"
              >
                <span className="material-symbols-outlined text-[24px]">
                  {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
