import React, { useEffect, useState } from 'react';
import { AchievementState, getAchievements } from '../../../modules/achievements';
import Spinner from '../ui/Spinner';

interface AchievementsModalProps {
  onClose: () => void;
}

function formatDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AchievementsModal({ onClose }: AchievementsModalProps) {
  const [list, setList] = useState<AchievementState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAchievements().then((a) => {
      if (!cancelled) {
        setList(a);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unlockedCount = list.filter((a) => a.unlocked).length;

  return (
    <div
      id="achievements-overlay"
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      onClick={(e) => { if ((e.target as HTMLElement).id === 'achievements-overlay') onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/65 backdrop-blur-2xl" />

      {/* Container */}
      <div className="relative z-10 w-full max-w-2xl h-[82vh] bg-surface-container rounded-xl flex flex-col overflow-hidden animate-fade-in-scale">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-variant/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-xl leading-none">
              👹
            </div>
            <div>
              <h2 className="font-headline text-lg font-bold text-on-surface leading-tight">Logros</h2>
              <p className="text-xs text-on-surface-variant">
                {loading ? 'Calculando…' : `${unlockedCount} / ${list.length} desbloqueados`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-variant/40 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {list.map((a) => {
                const pct = Math.round((a.value / a.def.goal) * 100);
                return (
                  <div
                    key={a.def.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      a.unlocked
                        ? 'bg-primary/10 border-primary/25'
                        : 'bg-surface-container-high/40 border-surface-variant/10'
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`w-12 h-12 flex-none rounded-xl flex items-center justify-center ${
                        a.unlocked ? 'bg-primary/20' : 'bg-surface-container-high'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined ${a.unlocked ? 'filled text-primary' : 'text-on-surface-variant/40'}`}
                      >
                        {a.unlocked ? a.def.icon : 'lock'}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-headline font-bold text-sm leading-tight ${a.unlocked ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                          {a.def.title}
                        </p>
                        {a.unlocked && (
                          <span className="material-symbols-outlined filled text-primary text-[15px]">verified</span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant leading-snug mt-0.5 line-clamp-2">
                        {a.def.description}
                      </p>

                      {a.unlocked ? (
                        <p className="text-[10px] text-primary/70 mt-1">
                          Desbloqueado · {formatDate(a.unlockedAt)}
                        </p>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                            <div className="h-full gradient-progress" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-on-surface-variant/70 flex-none">
                            {a.value}/{a.def.goal}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
