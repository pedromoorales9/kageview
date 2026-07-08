import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../modules/store';
import { getCache, setCache } from '../../modules/cache';
import {
  RemoteConfig,
  fetchRemoteConfig,
  publishRemoteConfig,
} from '../../modules/remoteConfig';
import { useToast } from './ui/Toast';

// ═══════════════════════════════════════════════════════════
// DevPanel — Panel de Desarrollador (Ajustes)
//
// Edita el remote-config.json de gh-pages desde la propia app:
// anuncios para todos los usuarios y kill-switches de providers.
// La contraseña (del .env) solo desbloquea la UI; la autorización
// real es el PAT de GitHub, guardado únicamente en esta máquina.
// ═══════════════════════════════════════════════════════════

/** Providers que se pueden desactivar remotamente. */
const SWITCHABLE_PROVIDERS: Array<{ id: string; label: string; kind: 'anime' | 'manga' }> = [
  { id: 'animeflv', label: 'AnimeFLV', kind: 'anime' },
  { id: 'animeav1', label: 'AnimeAV1', kind: 'anime' },
  { id: 'jkanime', label: 'JKAnime', kind: 'anime' },
  { id: 'mangadex', label: 'MangaDex', kind: 'manga' },
  { id: 'inmanga', label: 'InManga', kind: 'manga' },
  { id: 'manhwaweb', label: 'ManhwaWeb', kind: 'manga' },
  { id: 'mangaoni', label: 'MangaOni', kind: 'manga' },
];

const DEFAULT_DISABLE_MSG = 'Desactivado temporalmente por mantenimiento.';

export default function DevPanel() {
  const toast = useToast();
  const setRemoteConfig = useAppStore((s) => s.setRemoteConfig);

  const [unlocked, setUnlocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);

  // PAT de GitHub (solo en esta máquina, vía electron-store)
  const [token, setToken] = useState('');

  // Formulario
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annType, setAnnType] = useState<'info' | 'warning' | 'error'>('info');
  const [annExistingId, setAnnExistingId] = useState<string | null>(null);
  const [annRebroadcast, setAnnRebroadcast] = useState(false);
  const [disabled, setDisabled] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);

  // Cargar token guardado y el config actual al desbloquear
  useEffect(() => {
    if (!unlocked) return;
    getCache<string>('devPanelToken').then((t) => { if (t) setToken(t); });
    fetchRemoteConfig().then((rc) => {
      if (!rc) return;
      if (rc.announcement) {
        setAnnTitle(rc.announcement.title ?? '');
        setAnnMessage(rc.announcement.message ?? '');
        setAnnType(rc.announcement.type ?? 'info');
        setAnnExistingId(rc.announcement.id ?? null);
      }
      setDisabled(rc.providersDisabled ?? {});
    });
  }, [unlocked]);

  const handleUnlock = async () => {
    setChecking(true);
    try {
      const ok = await window.electron?.devPanelUnlock?.(password);
      if (ok) {
        setUnlocked(true);
        setPassword('');
      } else {
        toast.error('Contraseña incorrecta.', 'Panel de desarrollador');
      }
    } finally {
      setChecking(false);
    }
  };

  const handleSaveToken = (value: string) => {
    setToken(value);
    setCache('devPanelToken', value.trim() || undefined);
  };

  const handlePublish = async () => {
    if (!token.trim()) {
      toast.warning('Introduce tu token de GitHub (con permiso de escritura en el repo).', 'Falta el token');
      return;
    }
    setPublishing(true);
    try {
      const message = annMessage.trim();
      const config: RemoteConfig = {
        announcement: message
          ? {
              // id nuevo → todos los usuarios vuelven a ver el aviso
              id: !annRebroadcast && annExistingId ? annExistingId : `ann-${Date.now()}`,
              type: annType,
              title: annTitle.trim() || undefined,
              message,
            }
          : null,
        providersDisabled: Object.fromEntries(
          Object.entries(disabled).filter(([, msg]) => msg !== undefined)
        ),
      };

      await publishRemoteConfig(token.trim(), config);
      setRemoteConfig(config); // reflejar en esta app al instante
      if (config.announcement) setAnnExistingId(config.announcement.id);
      setAnnRebroadcast(false);
      toast.success(
        'Los usuarios lo recogerán al arrancar o en su siguiente refresco (≤30 min).',
        'Configuración publicada'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido', 'No se pudo publicar');
    } finally {
      setPublishing(false);
    }
  };

  const toggleProvider = (id: string) => {
    setDisabled((prev) => {
      const next = { ...prev };
      if (next[id] !== undefined) delete next[id];
      else next[id] = DEFAULT_DISABLE_MSG;
      return next;
    });
  };

  // ─── Render ────────────────────────────────────────────
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-[11px] text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
      >
        <span className="material-symbols-outlined text-[13px]">lock</span>
        Panel de desarrollador
      </button>
    );
  }

  if (!unlocked) {
    return (
      <section className="bg-surface-container rounded-xl p-5">
        <h3 className="font-headline text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">lock</span>
          Panel de desarrollador
        </h3>
        <div className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
            placeholder="Contraseña"
            autoFocus
            className="flex-1 px-3 py-2 rounded-lg text-sm bg-surface-container-high text-on-surface placeholder:text-on-surface-variant/40 outline-none border border-transparent focus:border-primary/30"
          />
          <button
            onClick={handleUnlock}
            disabled={checking || !password}
            className="px-4 py-2 rounded-lg bg-primary/15 text-primary text-sm font-headline font-semibold hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            {checking ? '…' : 'Entrar'}
          </button>
          <button
            onClick={() => { setExpanded(false); setPassword(''); }}
            className="px-3 py-2 rounded-lg text-on-surface-variant hover:bg-surface-variant/30 text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-surface-container rounded-xl p-5 ring-1 ring-secondary/20">
      <h3 className="font-headline text-sm font-bold text-secondary mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
        Panel de desarrollador
      </h3>
      <p className="text-[11px] text-on-surface-variant/70 mb-4 leading-relaxed">
        Publica cambios en <code className="text-secondary/80">remote-config.json</code> (gh-pages).
        Todas las apps los recogen al arrancar o cada 30 minutos. Si algo va mal,
        también puedes editar el fichero a mano en GitHub.
      </p>

      {/* Token */}
      <div className="mb-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Token de GitHub (contents: write) — solo se guarda en esta máquina
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => handleSaveToken(e.target.value)}
          placeholder="github_pat_…"
          spellCheck={false}
          className="mt-1 w-full px-3 py-2 rounded-lg text-[12px] bg-surface-container-high text-on-surface placeholder:text-on-surface-variant/40 outline-none border border-transparent focus:border-primary/30 font-mono"
        />
      </div>

      {/* Anuncio */}
      <div className="mb-4 p-3 rounded-lg bg-surface-container-high/50 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Aviso para los usuarios (vacío = sin aviso)
        </p>
        <div className="grid grid-cols-12 gap-2">
          <input
            type="text"
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="col-span-8 px-2.5 py-1.5 rounded-lg text-[12px] bg-background/50 text-on-surface placeholder:text-on-surface-variant/40 outline-none border border-transparent focus:border-primary/30"
          />
          <select
            value={annType}
            onChange={(e) => setAnnType(e.target.value as typeof annType)}
            className="col-span-4 px-2 py-1.5 rounded-lg text-[12px] bg-background/50 text-on-surface outline-none cursor-pointer"
          >
            <option value="info">Info</option>
            <option value="warning">Advertencia</option>
            <option value="error">Error</option>
          </select>
        </div>
        <textarea
          value={annMessage}
          onChange={(e) => setAnnMessage(e.target.value)}
          placeholder="Mensaje que verán todos los usuarios…"
          rows={2}
          className="w-full px-2.5 py-1.5 rounded-lg text-[12px] bg-background/50 text-on-surface placeholder:text-on-surface-variant/40 outline-none border border-transparent focus:border-primary/30 resize-none"
        />
        {annExistingId && annMessage.trim() && (
          <label className="flex items-center gap-2 text-[11px] text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={annRebroadcast}
              onChange={(e) => setAnnRebroadcast(e.target.checked)}
              className="accent-primary"
            />
            Volver a mostrarlo a quien ya lo vio (genera un id nuevo)
          </label>
        )}
      </div>

      {/* Kill-switches */}
      <div className="mb-4 p-3 rounded-lg bg-surface-container-high/50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
          Servicios desactivados para todos los usuarios
        </p>
        <div className="space-y-2">
          {SWITCHABLE_PROVIDERS.map((p) => {
            const isOff = disabled[p.id] !== undefined;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <label className="flex items-center gap-2 w-32 flex-none text-[12px] text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOff}
                    onChange={() => toggleProvider(p.id)}
                    className="accent-error"
                  />
                  {p.label}
                  <span className="text-[9px] text-on-surface-variant/50 uppercase">{p.kind}</span>
                </label>
                {isOff && (
                  <input
                    type="text"
                    value={disabled[p.id]}
                    onChange={(e) => setDisabled((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="Motivo mostrado a los usuarios"
                    className="flex-1 px-2.5 py-1 rounded-lg text-[11px] bg-background/50 text-on-surface placeholder:text-on-surface-variant/40 outline-none border border-transparent focus:border-error/30"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="px-5 py-2 rounded-lg bg-secondary/20 text-secondary text-sm font-headline font-bold hover:bg-secondary/30 transition-colors disabled:opacity-40"
        >
          {publishing ? 'Publicando…' : 'Publicar cambios'}
        </button>
        <button
          onClick={() => { setUnlocked(false); setExpanded(false); }}
          className="px-3 py-2 rounded-lg text-on-surface-variant hover:bg-surface-variant/30 text-sm transition-colors"
        >
          Cerrar
        </button>
        <span className="flex-1" />
        <button
          onClick={() => window.electron?.openExternal(
            'https://github.com/pedromoorales9/kageview/blob/gh-pages/remote-config.json'
          )}
          className="text-[11px] text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
        >
          Ver fichero en GitHub ↗
        </button>
      </div>
    </section>
  );
}
