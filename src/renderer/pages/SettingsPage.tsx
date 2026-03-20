import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../modules/store';
import { PROVIDERS } from '../../modules/providers/registry';
import { clearCache } from '../../modules/cache';
import useAniList from '../hooks/useAniList';
import { ProviderId, AudioLang, SubLang } from '../../types/types';

const PROVIDER_LIST: Array<{
  id: ProviderId;
  name: string;
  initial: string;
  color: string;
}> = [
    { id: 'animeflv', name: 'AnimeFLV', initial: 'F', color: '#4ade80' },
    { id: 'jkanime', name: 'JKAnime', initial: 'J', color: '#60a5fa' },
  ];

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-400',
  unstable: 'bg-yellow-400',
  offline: 'bg-red-400',
};

export default function SettingsPage() {
  const prefs = useAppStore((s) => s.prefs);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const user = useAppStore((s) => s.user);
  const providerStatus = useAppStore((s) => s.providerStatus);
  const setProviderStatus = useAppStore((s) => s.setProviderStatus);
  const { logout } = useAniList();

  const [checkingProviders, setCheckingProviders] = useState(false);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    window.electron.getVersion?.().then(setVersion);
  }, []);

  // Comprobar estado de providers al montar
  useEffect(() => {
    let cancelled = false;
    async function checkProviders() {
      setCheckingProviders(true);
      for (const p of PROVIDER_LIST) {
        try {
          const healthy = await PROVIDERS[p.id].healthCheck();
          if (!cancelled) {
            setProviderStatus(p.id, healthy ? 'online' : 'offline');
          }
        } catch {
          if (!cancelled) {
            setProviderStatus(p.id, 'offline');
          }
        }
      }
      if (!cancelled) setCheckingProviders(false);
    }
    checkProviders();
    return () => { cancelled = true; };
  }, [setProviderStatus]);

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8">
      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Account */}
        <div className="col-span-4 space-y-6">
          {/* Account Section */}
          <section className="bg-surface-container rounded-xl p-5">
            <h3 className="font-headline text-sm font-bold text-on-surface mb-4">
              Cuenta
            </h3>
            {user ? (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={user.avatar.large}
                  alt={user.name}
                  className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/30"
                />
                <p className="font-headline font-semibold text-on-surface">
                  {user.name}
                </p>
                <div className="flex gap-2 w-full">
                  <button className="
                    flex-1 py-2 rounded-lg
                    bg-primary/15 text-primary text-xs font-headline font-semibold
                    hover:bg-primary/25 transition-colors
                  ">
                    Sincronizar
                  </button>
                  <button
                    onClick={logout}
                    className="
                      flex-1 py-2 rounded-lg
                      bg-error/15 text-error text-xs font-headline font-semibold
                      hover:bg-error/25 transition-colors
                    "
                  >
                    Desconectar
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant text-center py-4">
                No conectada
              </p>
            )}
          </section>

          {/* Credits Section */}
          <section className="bg-surface-container rounded-xl p-5 relative overflow-hidden">
            <div className="absolute -inset-1 bg-gradient-to-tr from-primary/10 to-secondary/10 blur-xl pointer-events-none" />
            <h3 className="font-headline text-sm font-bold text-primary mb-4 relative z-10 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">terminal</span>
              Desarrollo
            </h3>
            <div className="relative z-10 text-center flex flex-col items-center gap-3">
              <style>{`
                @keyframes epic-shine {
                  to {
                    background-position: 200% center;
                  }
                }
                .animate-epic-shine {
                  background: linear-gradient(to right, #acaab1 20%, #cb97ff 40%, #f673b7 60%, #acaab1 80%);
                  background-size: 200% auto;
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                  animation: epic-shine 4s linear infinite;
                }
              `}</style>
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-surface-container-highest to-background flex items-center justify-center ring-1 ring-white/5 shadow-xl relative group">
                <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-full" />
                <span className="material-symbols-outlined text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary text-3xl font-light relative z-10">
                  diamond
                </span>
              </div>
              <div>
                <p className="font-headline font-bold text-on-surface tracking-wide text-lg drop-shadow-[0_0_8px_rgba(203,151,255,0.5)]">
                  Sh4d0w
                </p>
                <p className="text-[11px] font-label uppercase text-on-surface-variant tracking-[0.2em] mt-1 relative">
                  Ingeniería & Diseño
                </p>
              </div>
              <div className="mt-4 px-4 py-4 bg-background/60 rounded-xl border border-white/5 relative w-full overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                {/* Glowing reactor core behind text */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-16 bg-primary/10 blur-[30px] rounded-full pointer-events-none" />
                <span className="absolute -top-1 -left-1 text-5xl text-primary/10 font-serif pointer-events-none">"</span>

                <p className="text-base font-headline font-black leading-relaxed italic text-center relative z-10 animate-epic-shine drop-shadow-[0_0_12px_rgba(203,151,255,0.2)] px-2">
                  Mientras otros veían anime,<br /> yo construí el lugar donde verlo.
                </p>
                <p className="text-secondary font-bold mt-3 block tracking-[0.25em] uppercase text-[9px] relative z-10 opacity-90 drop-shadow-[0_0_5px_rgba(246,115,183,0.4)]">
                  El código es mi guion. El mundo, mi espectador.
                </p>

                <span className="absolute -bottom-4 -right-1 text-5xl text-primary/10 font-serif pointer-events-none">"</span>
              </div>
              <div className="flex gap-2 w-full mt-2">
                <button
                  onClick={() => window.electron?.openExternal('https://github.com/pedromoorales9/KageView')}
                  className="
                    flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-white/5
                    bg-surface-container-high text-on-surface text-[11px] font-label font-bold uppercase tracking-wider
                    hover:bg-surface-variant transition-colors
                  "
                >
                  <span className="material-symbols-outlined text-[14px]">code_blocks</span>
                  Código (v{version || '...'})
                </button>
                <button
                  onClick={() => window.electron?.updaterCheck()}
                  className="
                    flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-primary/20
                    bg-primary/10 text-primary text-[11px] font-label font-bold uppercase tracking-wider
                    hover:bg-primary/20 transition-colors
                  "
                >
                  <span className="material-symbols-outlined text-[14px]">sync</span>
                  Buscar Update
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Settings */}
        <div className="col-span-8 space-y-6">
          {/* Playback */}
          <section className="bg-surface-container rounded-xl p-5">
            <h3 className="font-headline text-sm font-bold text-on-surface mb-4">
              Reproducción
            </h3>
            <div className="space-y-4">
              {/* Audio language */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-on-surface-variant">Idioma del Audio</label>
                <select
                  value={prefs.audioLanguage}
                  onChange={(e) => setPrefs({ audioLanguage: e.target.value as AudioLang })}
                  className="
                    px-3 py-1.5 rounded-lg
                    bg-surface-container-high text-on-surface text-sm
                    outline-none border border-transparent focus:border-primary/30
                    cursor-pointer
                  "
                >
                  <option value="ja">Japonés</option>
                  <option value="en">Inglés</option>
                  <option value="es">Español</option>
                </select>
              </div>

              {/* Subtitles */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-on-surface-variant">Subtítulos</label>
                <select
                  value={prefs.subtitleLanguage}
                  onChange={(e) => setPrefs({ subtitleLanguage: e.target.value as SubLang })}
                  className="
                    px-3 py-1.5 rounded-lg
                    bg-surface-container-high text-on-surface text-sm
                    outline-none border border-transparent focus:border-primary/30
                    cursor-pointer
                  "
                >
                  <option value="en">Inglés</option>
                  <option value="es">Español</option>
                  <option value="off">Apagado</option>
                </select>
              </div>

              {/* Skip Intro */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-on-surface-variant">Saltar Intro</label>
                <ToggleSwitch
                  checked={prefs.skipIntro}
                  onChange={(v) => setPrefs({ skipIntro: v })}
                />
              </div>

              {/* Skip Outro */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-on-surface-variant">Saltar Outro</label>
                <ToggleSwitch
                  checked={prefs.skipOutro}
                  onChange={(v) => setPrefs({ skipOutro: v })}
                />
              </div>
            </div>
          </section>

          {/* Providers */}
          <section className="bg-surface-container rounded-xl p-5">
            <h3 className="font-headline text-sm font-bold text-on-surface mb-4">
              Proveedores
              {checkingProviders && (
                <span className="text-[10px] text-on-surface-variant ml-2 font-normal">
                  comprobando...
                </span>
              )}
            </h3>
            <div className="space-y-3">
              {PROVIDER_LIST.map((p) => (
                <div
                  key={p.id}
                  className="
                    flex items-center gap-3 p-3 rounded-lg
                    bg-surface-container-high/50
                  "
                >
                  {/* Initial */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center font-headline font-bold text-sm"
                    style={{ backgroundColor: `${p.color}20`, color: p.color }}
                  >
                    {p.initial}
                  </div>

                  {/* Name */}
                  <span className="flex-1 text-sm font-label text-on-surface">
                    {p.name}
                  </span>

                  {/* Status indicator */}
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[providerStatus[p.id]]}`} />
                    <span className="text-[11px] text-on-surface-variant capitalize">
                      {providerStatus[p.id]}
                    </span>
                  </div>

                  {/* Toggle */}
                  <ToggleSwitch
                    checked={prefs.providersEnabled[p.id]}
                    onChange={(v) => {
                      setPrefs({
                        providersEnabled: { ...prefs.providersEnabled, [p.id]: v },
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Test buttons removed */}
          </section>

          {/* Danger Zone */}
          <section className="bg-surface-container rounded-xl p-5">
            <h3 className="font-headline text-sm font-bold text-error mb-4">
              Zona de Peligro
            </h3>
            <button
              onClick={async () => {
                await clearCache();
                alert('¡Caché de la app limpiada! Reinicie KageView para aplicar los cambios.');
              }}
              className="
                px-4 py-2. rounded-lg
                bg-error/15 text-error text-xs font-headline font-semibold
                hover:bg-error/25 transition-colors
              "
            >
              Borrar Caché de la Aplicación
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle Switch Component ─────────────────────────────
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`
        relative w-10 h-[22px] rounded-full
        transition-colors duration-200
        ${checked ? 'bg-primary' : 'bg-surface-variant'}
      `}
    >
      <div
        className={`
          absolute top-[3px] w-4 h-4 rounded-full bg-white
          transition-transform duration-200
          ${checked ? 'translate-x-[22px]' : 'translate-x-[3px]'}
        `}
      />
    </button>
  );
}
