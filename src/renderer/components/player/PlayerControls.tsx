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
    <div
      className={`
        absolute inset-x-0 bottom-0 z-[82]
        transition-opacity duration-300
        ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}
    >
      {/* Gradiente inferior para legibilidad */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

      {/* Top bar — Close */}
      <div className={`
        absolute top-0 left-0 right-0 p-4 flex items-center justify-between
        transition-opacity duration-300
        ${visible ? 'opacity-100' : 'opacity-0'}
      `}>
        <button
          onClick={onExit}
          className="w-9 h-9 rounded-lg bg-black/40 backdrop-blur-md flex items-center justify-center
            text-white/80 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="relative px-6 pb-5 pt-12">
        {/* Progress Bar */}
        <div
          className="group relative w-full h-1 bg-white/20 rounded-full cursor-pointer mb-4 hover:h-1.5 transition-all"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = x / rect.width;
            onSeek(pct * duration);
          }}
        >
          <div
            className="h-full gradient-progress rounded-full progress-glow relative"
            style={{ width: `${progressPercent}%` }}
          >
            {/* Thumb */}
            <div className="
              absolute right-0 top-1/2 -translate-y-1/2
              w-3 h-3 rounded-full bg-white
              opacity-0 group-hover:opacity-100
              shadow-[0_0_8px_rgba(203,151,255,0.5)]
              transition-opacity duration-200
            " />
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-4">
          {/* Left controls */}
          <div className="flex items-center gap-2">
            {/* Prev ep */}
            <button
              onClick={onPrevEpisode}
              className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-xl">skip_previous</span>
            </button>

            {/* Play/Pause */}
            <button
              onClick={onPlayPause}
              className="
                w-11 h-11 rounded-full bg-white flex items-center justify-center
                text-black hover:scale-105 transition-transform
              "
            >
              <span className="material-symbols-outlined filled text-2xl">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            {/* Next ep */}
            <button
              onClick={onNextEpisode}
              className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-xl">skip_next</span>
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol ml-2">
              <button
                onClick={onMute}
                className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white transition-colors"
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
                  transition-all duration-200
                  h-1 appearance-none bg-white/20 rounded-full cursor-pointer
                  accent-primary
                "
              />
            </div>
          </div>

          {/* Center — Title & Time */}
          <div className="flex-1 flex items-center justify-center gap-3">
            <span className="text-xs text-white/70 font-label">
              {formatTime(currentTime)}
            </span>
            <span className="text-sm text-white/90 font-label font-medium truncate max-w-xs">
              {episodeTitle}
            </span>
            <span className="text-xs text-white/70 font-label">
              {formatTime(duration)}
            </span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Subtitles */}
            <button className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white transition-colors">
              <span className="material-symbols-outlined text-xl">subtitles</span>
            </button>

            {/* Settings */}
            <button className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white transition-colors">
              <span className="material-symbols-outlined text-xl">settings</span>
            </button>

            {/* Fullscreen */}
            <button
              onClick={onFullscreen}
              className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-xl">
                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
