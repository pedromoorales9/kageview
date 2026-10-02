import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../modules/store';
import { buildBuiltinProvider, buildCustomProvider } from '../../modules/providers/registry';
import { getAllMangaProviders, providerLanguage } from '../../modules/manga';
import { clearCache } from '../../modules/cache';
import { useToast } from '../components/ui/Toast';
import { errorMessage, openAuth, signOut } from '../../modules/account';
import Avatar from '../components/account/Avatar';
import AniListCard from '../components/anilist/AniListCard';
import Spinner from '../components/ui/Spinner';
import RoleBadge from '../components/account/RoleBadge';
import { isStaff } from '../../modules/backend';
import { ProviderId, AudioLang, SubLang, CustomProviderDef } from '../../types/types';

const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  animeflv: 'https://animeflv.net',
  jkanime: 'https://jkanime.net',
  animeav1: 'https://animeav1.com',
};

const PROVIDER_LIST: Array<{
  id: ProviderId;
  name: string;
  initial: string;
  color: string;
}> = [
    { id: 'animeflv', name: 'AnimeFLV', initial: 'F', color: '#4ade80' },
    { id: 'jkanime', name: 'JKAnime', initial: 'J', color: '#60a5fa' },
    { id: 'animeav1', name: 'AnimeAV1', initial: 'A', color: '#ec4899' },
  ];

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-400',
  unstable: 'bg-yellow-400',
  offline: 'bg-red-400',
};

interface SettingsPageProps {
  onOpenAdmin?: () => void;
}

export default function SettingsPage({ onOpenAdmin }: SettingsPageProps) {
  const prefs = useAppStore((s) => s.prefs);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const account = useAppStore((s) => s.account);
  const setProfileModalOpen = useAppStore((s) => s.setProfileModalOpen);
  const providerStatus = useAppStore((s) => s.providerStatus);
  const setProviderStatus = useAppStore((s) => s.setProviderStatus);
  const remoteConfig = useAppStore((s) => s.remoteConfig);
  const toast = useToast();

  const [checkingProviders, setCheckingProviders] = useState(false);
  const [version, setVersion] = useState<string>('');

  // Formulario de sitios personalizados
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteTemplate, setNewSiteTemplate] = useState<ProviderId>('animeflv');

  /** Guarda (o limpia) la URL alternativa de un provider integrado. */
  const commitMirror = (pid: ProviderId, raw: string) => {
    const value = raw.trim().replace(/\/+$/, '');
    const next = { ...prefs.providerBaseUrls };
    if (!value || value === DEFAULT_BASE_URLS[pid]) {
      delete next[pid];
    } else if (!/^https?:\/\/./.test(value)) {
      toast.warning('La URL debe empezar por http:// o https://', 'Mirror no válido');
      return;
    } else {
      next[pid] = value;
    }
    setPrefs({ providerBaseUrls: next });
  };

  const handleAddCustomSite = () => {
    const name = newSiteName.trim();
    const baseUrl = newSiteUrl.trim().replace(/\/+$/, '');
    if (!name) {
      toast.warning('Ponle un nombre al sitio.', 'Falta el nombre');
      return;
    }
    if (!/^https?:\/\/./.test(baseUrl)) {
      toast.warning('La URL debe empezar por http:// o https://', 'URL no válida');
      return;
    }
    const def: CustomProviderDef = {
      id: `custom-${Date.now()}`,
      name,
      baseUrl,
      template: newSiteTemplate,
    };
    setPrefs({ customProviders: [...(prefs.customProviders ?? []), def] });
    setNewSiteName('');
    setNewSiteUrl('');
    toast.success(`"${name}" se probará después de los proveedores integrados.`, 'Sitio añadido');
  };

  const handleRemoveCustomSite = (id: string) => {
    setPrefs({
      customProviders: (prefs.customProviders ?? []).filter((c) => c.id !== id),
    });
  };

  useEffect(() => {
    window.electron.getVersion?.().then(setVersion);
  }, []);

  // Comprobar estado de providers al montar y cuando cambian mirrors/personalizados
  useEffect(() => {
    let cancelled = false;
    async function checkProviders() {
      setCheckingProviders(true);
      const toCheck = [
        ...PROVIDER_LIST.map((p) => buildBuiltinProvider(p.id, prefs)),
        ...(prefs.customProviders ?? [])
          .map(buildCustomProvider)
          .filter((p): p is NonNullable<typeof p> => p !== null),
      ];
      for (const provider of toCheck) {
        try {
          const healthy = await provider.healthCheck();
          if (!cancelled) {
            setProviderStatus(provider.id, healthy ? 'online' : 'offline');
          }
        } catch {
          if (!cancelled) {
            setProviderStatus(provider.id, 'offline');
          }
        }
      }
      if (!cancelled) setCheckingProviders(false);
    }
    checkProviders();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setProviderStatus, prefs.providerBaseUrls, prefs.customProviders]);

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8">
      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Account */}
        <div className="col-span-4 space-y-6">
          {/* Account Section */}
          <section className="panel p-6">
            <h3 className="font-headline text-sm font-bold text-on-surface mb-4">
              Cuenta
            </h3>
            {account.status === 'signedIn' && account.profile ? (
              <div className="flex flex-col items-center gap-3">
                <Avatar profile={account.profile} size={72} className="ring-2 ring-primary/40" />
                <div className="text-center min-w-0 max-w-full">
                  <p className="font-headline font-semibold text-on-surface truncate">
                    {account.profile.displayName || account.profile.username}
                  </p>
                  <RoleBadge role={account.profile.role} className="my-1" />
                  <p className="text-xs text-muted truncate">@{account.profile.username}</p>
                  <p className="text-xs text-muted truncate">{account.user?.email}</p>
                </div>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => setProfileModalOpen(true)}
                    className="flex-1 py-2 rounded-lg bg-primary/15 text-primary text-xs font-headline font-semibold hover:bg-primary/25 transition-colors"
                  >
                    Editar perfil
                  </button>
                  <button
                    onClick={() => signOut().catch((e) => toast.error(errorMessage(e)))}
                    className="flex-1 py-2 rounded-lg bg-white/[0.07] text-on-surface text-xs font-headline font-semibold hover:bg-white/[0.13] transition-colors"
                  >
                    Cerrar sesión
                  </button>
                </div>
              </div>
            ) : account.status === 'unavailable' ? (
              <p className="text-sm text-on-surface-variant text-center py-4">
                Las cuentas no están configuradas en esta versión.
              </p>
            ) : account.status === 'loading' ? (
              <div className="flex justify-center py-6"><Spinner size={24} /></div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-2">
                <p className="text-sm text-on-surface-variant text-center">
                  Inicia sesión para guardar tu lista y ver a tus amigos.
                </p>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => openAuth('login')}
                    className="flex-1 py-2 rounded-lg btn-moon text-xs font-headline font-semibold"
                  >
                    Iniciar sesión
                  </button>
                  <button
                    onClick={() => openAuth('register')}
                    className="flex-1 py-2 rounded-lg bg-white/[0.07] text-on-surface text-xs font-headline font-semibold hover:bg-white/[0.13] transition-colors"
                  >
                    Crear cuenta
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Administración: solo se muestra al equipo (owner/admin) */}
          {isStaff(account.profile?.role) && (
            <section className="panel p-6 relative overflow-hidden ring-1 ring-primary/25">
              <div className="pointer-events-none absolute -top-20 -right-16 w-[220px] h-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,61,90,0.16),transparent_68%)]" />
              <div className="relative flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-headline text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">admin_panel_settings</span>
                    Administración
                  </h3>
                  <RoleBadge role={account.profile?.role} />
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Publica anuncios para todos los usuarios, apaga servicios caídos y gestiona el equipo.
                </p>
                <button
                  onClick={onOpenAdmin}
                  className="h-9 rounded-full btn-moon text-[13px] font-semibold flex items-center justify-center gap-1.5"
                >
                  Abrir panel de administración
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            </section>
          )}

          {/* Credits Section */}
          <section className="panel p-6 relative overflow-hidden">
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
                  background: linear-gradient(to right, #bcaab2 20%, #ff8fa8 40%, #ff8fa8 60%, #bcaab2 80%);
                  background-size: 200% auto;
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                  /* Solo al pasar el ratón: animar background-position repinta el
                     texto en cada fotograma y mantendría la GPU ocupada. */
                  animation: epic-shine 4s linear infinite paused;
                }
                .animate-epic-shine:hover { animation-play-state: running; }
              `}</style>
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-surface-container-highest to-background flex items-center justify-center ring-1 ring-white/5 shadow-xl relative group">
                <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-full" />
                <span className="material-symbols-outlined text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary text-3xl font-light relative z-10">
                  diamond
                </span>
              </div>
              <div>
                <p className="font-headline font-bold text-on-surface tracking-wide text-lg drop-shadow-[0_0_8px_rgba(255, 143, 168,0.5)]">
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

                <p className="text-base font-headline font-black leading-relaxed italic text-center relative z-10 animate-epic-shine drop-shadow-[0_0_12px_rgba(255, 143, 168,0.2)] px-2">
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
          <section className="panel p-6">
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

          {/* Integrations */}
          <section className="panel p-6">
            <h3 className="font-headline text-sm font-bold text-on-surface mb-4">
              Integraciones
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-on-surface-variant">Discord Rich Presence</label>
                <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                  Muestra el anime y episodio que estás viendo en tu perfil de Discord
                </p>
              </div>
              <ToggleSwitch
                checked={prefs.discordRpc}
                onChange={(v) => {
                  setPrefs({ discordRpc: v });
                  window.electron?.discordSetEnabled?.(v);
                }}
              />
            </div>
          </section>

          {/* AniList */}
          <AniListCard />

          {/* Providers */}
          <section className="panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-sm font-bold text-on-surface">
                Proveedores de Anime
                {checkingProviders && (
                  <span className="text-[10px] text-on-surface-variant ml-2 font-normal">
                    comprobando...
                  </span>
                )}
              </h3>
              <span className="text-[10px] text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px] text-yellow-400">star</span>
                = favorito (carga primero)
              </span>
            </div>
            <div className="space-y-3">
              {PROVIDER_LIST.map((p) => {
                const isFavorite = prefs.preferredProvider === p.id;
                const mirror = prefs.providerBaseUrls?.[p.id] ?? '';
                const remoteReason = remoteConfig?.providersDisabled?.[p.id];
                return (
                  <div
                    key={p.id}
                    className={`
                      p-3 rounded-lg transition-colors
                      ${isFavorite ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-surface-container-high/50'}
                    `}
                  >
                    <div className="flex items-center gap-3">
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
                      {mirror && (
                        <span className="ml-2 text-[10px] text-secondary font-bold uppercase tracking-wide">
                          mirror
                        </span>
                      )}
                    </span>

                    {/* Status indicator */}
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[providerStatus[p.id] ?? 'offline']}`} />
                      <span className="text-[11px] text-on-surface-variant capitalize">
                        {providerStatus[p.id] ?? 'offline'}
                      </span>
                    </div>

                    {/* Favorite star */}
                    <button
                      title={isFavorite ? 'Favorito actual' : 'Marcar como favorito'}
                      onClick={() => setPrefs({ preferredProvider: p.id as ProviderId })}
                      className={`
                        p-1 rounded-md transition-colors
                        ${isFavorite
                          ? 'text-yellow-400'
                          : 'text-on-surface-variant/40 hover:text-yellow-400/70'}
                      `}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isFavorite ? 'star' : 'star'}
                      </span>
                    </button>

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

                    {/* Desactivado remotamente por el desarrollador */}
                    {remoteReason && (
                      <p className="mt-2 pl-12 text-[11px] text-error flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px]">block</span>
                        Desactivado por el desarrollador: {remoteReason}
                      </p>
                    )}

                    {/* URL alternativa (mirror) */}
                    <div className="flex items-center gap-2 mt-2 pl-12">
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/50">link</span>
                      <input
                        key={`${p.id}-${mirror}`}
                        type="text"
                        defaultValue={mirror}
                        placeholder={`URL alternativa (por defecto ${DEFAULT_BASE_URLS[p.id]})`}
                        onBlur={(e) => commitMirror(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        spellCheck={false}
                        className="
                          flex-1 px-2.5 py-1.5 rounded-lg text-[12px]
                          bg-background/50 text-on-surface placeholder:text-on-surface-variant/40
                          outline-none border border-transparent focus:border-primary/30
                        "
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Sitios personalizados de anime */}
          <section className="panel p-6">
            <h3 className="font-headline text-sm font-bold text-on-surface mb-1">
              Sitios personalizados de anime
            </h3>
            <p className="text-[11px] text-on-surface-variant/70 mb-4 leading-relaxed">
              Añade un sitio que use la misma estructura que uno de los proveedores
              integrados (clones y mirrors de AnimeFLV, JKAnime o AnimeAV1). Se
              intentan después de los integrados cuando estos fallan.
            </p>

            {/* Lista */}
            {(prefs.customProviders ?? []).length > 0 && (
              <div className="space-y-2 mb-4">
                {(prefs.customProviders ?? []).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-high/50"
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-headline font-bold text-sm bg-secondary/15 text-secondary">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-label text-on-surface truncate">{c.name}</p>
                      <p className="text-[11px] text-on-surface-variant/60 truncate">
                        {c.baseUrl} · plantilla {c.template}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[providerStatus[c.id] ?? 'offline']}`} />
                      <span className="text-[11px] text-on-surface-variant capitalize">
                        {providerStatus[c.id] ?? 'offline'}
                      </span>
                    </div>
                    <button
                      title="Eliminar sitio"
                      onClick={() => handleRemoveCustomSite(c.id)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant/50 hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario de alta */}
            <div className="grid grid-cols-12 gap-2">
              <input
                type="text"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="Nombre"
                spellCheck={false}
                className="col-span-3 px-2.5 py-2 rounded-lg text-[12px] bg-surface-container-high text-on-surface placeholder:text-on-surface-variant/40 outline-none border border-transparent focus:border-primary/30"
              />
              <input
                type="text"
                value={newSiteUrl}
                onChange={(e) => setNewSiteUrl(e.target.value)}
                placeholder="https://sitio-clon.example"
                spellCheck={false}
                className="col-span-4 px-2.5 py-2 rounded-lg text-[12px] bg-surface-container-high text-on-surface placeholder:text-on-surface-variant/40 outline-none border border-transparent focus:border-primary/30"
              />
              <select
                value={newSiteTemplate}
                onChange={(e) => setNewSiteTemplate(e.target.value as ProviderId)}
                className="col-span-3 px-2 py-2 rounded-lg text-[12px] bg-surface-container-high text-on-surface outline-none border border-transparent focus:border-primary/30 cursor-pointer"
              >
                <option value="animeflv">Tipo AnimeFLV</option>
                <option value="animeav1">Tipo AnimeAV1</option>
                <option value="jkanime">Tipo JKAnime</option>
              </select>
              <button
                onClick={handleAddCustomSite}
                className="col-span-2 py-2 rounded-lg bg-primary/15 text-primary text-[12px] font-headline font-semibold hover:bg-primary/25 transition-colors"
              >
                Añadir
              </button>
            </div>
          </section>

          {/* Manga Providers */}
          <section className="panel p-6">
            <div className="flex items-center justify-between gap-4 mb-5 pb-5 border-b-[0.5px] border-white/[0.08]">
              <div className="min-w-0">
                <h3 className="font-headline text-sm font-bold text-on-surface">Capítulos en inglés (MangaDex)</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Muestra también títulos y capítulos en inglés cuando no hay traducción al español. Los capítulos en español siempre van primero.
                </p>
              </div>
              <ToggleSwitch
                checked={!!prefs.mangaIncludeEnglish}
                onChange={(v) => setPrefs({ mangaIncludeEnglish: v })}
              />
            </div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-sm font-bold text-on-surface">
                Proveedores de Manga
              </h3>
              <span className="text-[10px] text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px] text-yellow-400">star</span>
                = favorito (carga primero)
              </span>
            </div>
            <div className="space-y-3">
              {getAllMangaProviders().map((p) => {
                const isEnabled = prefs.mangaProvidersEnabled?.[p.id] ?? true;
                const isFavorite = prefs.preferredMangaProvider === p.id;
                const initial = p.name ? p.name.charAt(0).toUpperCase() : 'M';
                const remoteReason = remoteConfig?.providersDisabled?.[p.id];

                // Deterministic color generation based on id
                const colorHash = p.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const hue = colorHash % 360;
                const color = `hsl(${hue}, 70%, 65%)`;

                return (
                  <div
                    key={p.id}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg transition-colors
                      ${isFavorite ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-surface-container-high/50'}
                    `}
                  >
                    {/* Initial */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center font-headline font-bold text-sm"
                      style={{ backgroundColor: `hsla(${hue}, 70%, 65%, 0.1)`, color }}
                    >
                      {initial}
                    </div>

                    {/* Name */}
                    <span className="flex-1 text-sm font-label text-on-surface">
                      {p.name}
                      {providerLanguage(p.id) === 'en' && (
                        <span className="ml-2 align-middle text-[9.5px] font-bold tracking-wider text-on-surface-variant bg-white/[0.08] rounded px-1.5 py-0.5" title="Capítulos solo en inglés">EN</span>
                      )}
                      {remoteReason && (
                        <span className="block text-[10px] text-error mt-0.5">
                          Desactivado por el desarrollador: {remoteReason}
                        </span>
                      )}
                    </span>

                    {/* Favorite star */}
                    <button
                      title={isFavorite ? 'Favorito actual' : 'Marcar como favorito'}
                      onClick={() => setPrefs({ preferredMangaProvider: p.id })}
                      className={`
                        p-1 rounded-md transition-colors
                        ${isFavorite
                          ? 'text-yellow-400'
                          : 'text-on-surface-variant/40 hover:text-yellow-400/70'}
                      `}
                    >
                      <span className="material-symbols-outlined text-[18px]">star</span>
                    </button>

                    {/* Toggle */}
                    <ToggleSwitch
                      checked={isEnabled}
                      onChange={(v) => {
                        setPrefs({
                          mangaProvidersEnabled: {
                            ...prefs.mangaProvidersEnabled,
                            [p.id]: v
                          },
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* Danger Zone */}
          <section className="panel p-6">
            <h3 className="font-headline text-sm font-bold text-error mb-4">
              Zona de Peligro
            </h3>
            <button
              onClick={async () => {
                await clearCache();
                toast.success('Reinicia KageView para aplicar los cambios.', 'Caché limpiada');
              }}
              className="
                px-4 py-2 rounded-lg
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
