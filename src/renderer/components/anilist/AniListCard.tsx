import React, { useEffect, useMemo, useState } from 'react';
import {
  connectAniList,
  disconnectAniList,
  forgetAllLinks,
  submitAniListToken,
  syncNow,
  unlinkedRecords,
  useAniListSync,
} from '../../../modules/anilist/sync';
import { useMangaData } from '../../../modules/manga/mangaStore';
import { useAppStore } from '../../../modules/store';
import { safeCoverUrl } from '../../../modules/safeUrl';
import { timeAgo } from '../../../modules/social';
import Spinner from '../ui/Spinner';
import LinkMangaModal from './LinkMangaModal';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] flex-none rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-surface-variant'}`}
    >
      <span className={`absolute left-0 top-[3px] w-4 h-4 rounded-full bg-white transition-transform duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
    </button>
  );
}

export default function AniListCard() {
  const sync = useAniListSync();
  const records = useMangaData((s) => s.records);
  const signedIn = useAppStore((s) => s.account.status === 'signedIn');
  const { status, settings, phase, detail, error, counts, lastSyncAt, links, skipped } = sync;

  const [waiting, setWaiting] = useState(false);
  const [manual, setManual] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

  // Mientras se espera la vuelta de AniList (máx. 10 min, como el proceso principal)
  useEffect(() => {
    if (status?.connected) setWaiting(false);
    if (!waiting) return;
    const t = setTimeout(() => setWaiting(false), 10 * 60 * 1000);
    return () => clearTimeout(t);
  }, [waiting, status?.connected]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pending = useMemo(() => unlinkedRecords().length, [records, links, skipped]);
  const syncing = phase === 'syncing';

  const connect = async () => {
    setPasteError(null);
    const r = await connectAniList();
    if (r.ok) setWaiting(true);
    else setPasteError(r.error === 'not_configured' ? 'Esta versión de KageView no incluye la conexión con AniList.' : 'No se pudo abrir AniList.');
  };

  const submit = async () => {
    setPasteError(null);
    const r = await submitAniListToken(pasted);
    if (r.ok) { setPasted(''); setManual(false); setWaiting(false); }
    else setPasteError(r.error === 'invalid_token' ? 'AniList no aceptó ese token. Copia la dirección completa o el token.' : 'No se pudo conectar con AniList.');
  };

  const avatar = safeCoverUrl(status?.user?.avatar ?? null);

  // Sin identificador de AniList en esta compilación la función no existe para el usuario: no se muestra
  if (!status?.configured) return null;

  return (
    <section className="panel p-6" id="anilist">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center font-headline font-extrabold text-[15px] bg-[#3db4f2]/15 text-[#3db4f2]">A</div>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-sm font-bold text-on-surface">AniList</h3>
          <p className="text-[11px] text-on-surface-variant/70">Sincroniza tu lista de anime y manga en los dos sentidos</p>
        </div>
        {status?.connected && (
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#35e66a] bg-[#35e66a]/10 rounded-full px-2.5 py-1">Conectado</span>
        )}
      </div>

      {!status ? (
        <p className="text-[12.5px] text-muted">No disponible en esta versión.</p>
      ) : !status.configured ? (
        <p className="text-[12.5px] text-on-surface-variant leading-snug">
          Esta versión de KageView no incluye la conexión con AniList (falta el identificador de la aplicación en la compilación).
        </p>
      ) : !status.connected ? (
        <div className="flex flex-col gap-3">
          <ul className="text-[12.5px] text-on-surface-variant leading-snug space-y-1.5 list-disc pl-4">
            <li>Lo que veas y leas en KageView se refleja en tu AniList.</li>
            <li>Lo que ya tienes en AniList aparece en KageView.</li>
            <li><b className="text-white">Nunca se borra nada automáticamente</b>, ni en un lado ni en el otro.</li>
          </ul>
          <p className="text-[11.5px] text-muted leading-snug">
            AniList no permite permisos más acotados: al conectar, KageView podrá leer y modificar tu lista. Tu acceso se guarda cifrado en este equipo y no se envía a ningún otro sitio. Puedes revocarlo cuando quieras en AniList → Settings → Apps.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => void connect()} className="btn-moon h-10 px-5 rounded-full text-[13.5px] font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">link</span>
              Conectar con AniList
            </button>
            {waiting && (
              <span className="flex items-center gap-2 text-[12.5px] text-on-surface-variant">
                <Spinner size={15} /> Esperando a AniList… autoriza el acceso en el navegador.
              </span>
            )}
          </div>
          <div>
            <button onClick={() => setManual((m) => !m)} className="text-[12px] text-secondary hover:text-white">
              {manual ? 'Ocultar' : '¿El navegador no vuelve a KageView? Pega aquí el enlace'}
            </button>
            {manual && (
              <div className="mt-2 flex gap-2">
                <input
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Pega la dirección completa o el token"
                  aria-label="Enlace o token de AniList"
                  className="flex-1 h-9 px-3 rounded-lg bg-white/[0.07] text-[12.5px] text-white placeholder:text-muted outline-none focus:bg-white/[0.12]"
                />
                <button onClick={() => void submit()} disabled={!pasted.trim()} className="btn-glass h-9 px-4 rounded-lg text-[12.5px] font-medium disabled:opacity-40">Conectar</button>
              </div>
            )}
          </div>
          {pasteError && <p className="text-[12px] text-error">{pasteError}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Cuenta */}
          <div className="flex items-center gap-3">
            {avatar ? <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold">{status.user?.name.charAt(0).toUpperCase()}</div>}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-white truncate">{status.user?.name}</p>
              <p className="text-[11.5px] text-muted">{status.persistent ? 'Acceso guardado cifrado en este equipo' : 'Acceso solo en memoria: tendrás que volver a conectar al reiniciar'}</p>
            </div>
            <button onClick={() => void disconnectAniList()} className="btn-glass h-8 px-4 rounded-full text-[12.5px] font-medium">Desconectar</button>
          </div>

          {/* Qué sincronizar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-on-surface-variant">Anime</p>
                {!signedIn && <p className="text-[11px] text-muted">Necesita iniciar sesión en tu cuenta de KageView (tus listas de anime viven en ella).</p>}
              </div>
              <Switch checked={settings.anime} onChange={(v) => useAniListSync.setState({ settings: { ...settings, anime: v } })} label="Sincronizar anime" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-on-surface-variant">Manga</p>
              <Switch checked={settings.manga} onChange={(v) => useAniListSync.setState({ settings: { ...settings, manga: v } })} label="Sincronizar manga" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-on-surface-variant">Traer a KageView lo que solo está en AniList</p>
                <p className="text-[11px] text-muted">Los mangas aparecen como fichas «sin fuente de lectura» hasta que elijas dónde leerlos.</p>
              </div>
              <Switch checked={settings.importRemote} onChange={(v) => useAniListSync.setState({ settings: { ...settings, importRemote: v } })} label="Importar desde AniList" />
            </div>
          </div>

          {/* Estado */}
          <div className="rounded-xl bg-white/[0.04] p-3 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <button onClick={() => void syncNow()} disabled={syncing} className="btn-moon h-9 px-4 rounded-full text-[13px] font-semibold flex items-center gap-2 disabled:opacity-60">
                {syncing ? <Spinner size={15} /> : <span className="material-symbols-outlined text-[17px]">sync</span>}
                {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
              <span className="text-[12px] text-muted min-w-0 truncate">
                {syncing ? detail : lastSyncAt ? `Última vez ${timeAgo(new Date(lastSyncAt).toISOString())}` : 'Aún no se ha sincronizado'}
              </span>
            </div>
            {phase === 'error' && error && <p className="text-[12.5px] text-error leading-snug">{error}</p>}
            {phase !== 'syncing' && counts && lastSyncAt && (
              <p className="text-[12px] text-on-surface-variant leading-snug">
                {[
                  counts.animePushed + counts.mangaPushed > 0 && `${counts.animePushed + counts.mangaPushed} enviados a AniList`,
                  counts.animePulled + counts.mangaPulled > 0 && `${counts.animePulled + counts.mangaPulled} actualizados desde AniList`,
                  counts.imported > 0 && `${counts.imported} importados`,
                  counts.linkedAuto > 0 && `${counts.linkedAuto} mangas vinculados`,
                  counts.failed > 0 && `${counts.failed} no se pudieron sincronizar`,
                ].filter(Boolean).join(' · ') || 'Todo está al día.'}
              </p>
            )}
          </div>

          {/* Vincular mangas */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-on-surface-variant">Mangas sin vincular</p>
              <p className="text-[11px] text-muted">Para sincronizar un manga hay que saber cuál es en AniList. Los claros se vinculan solos; el resto los confirmas tú.</p>
            </div>
            <button onClick={() => setLinkOpen(true)} className="btn-glass h-9 px-4 rounded-full text-[12.5px] font-medium flex items-center gap-1.5">
              {pending > 0 && <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">{pending}</span>}
              Revisar
            </button>
          </div>

          <div className="text-right">
            {confirmForget ? (
              <span className="text-[12px] text-on-surface-variant">
                ¿Olvidar todos los vínculos?{' '}
                <button onClick={() => { forgetAllLinks(); setConfirmForget(false); }} className="text-error font-semibold hover:underline">Sí, olvidar</button>{' '}
                <button onClick={() => setConfirmForget(false)} className="text-muted hover:text-white">Cancelar</button>
              </span>
            ) : (
              <button onClick={() => setConfirmForget(true)} className="text-[11.5px] text-muted hover:text-white">Olvidar vínculos de manga</button>
            )}
          </div>
        </div>
      )}

      {linkOpen && <LinkMangaModal onClose={() => setLinkOpen(false)} />}
    </section>
  );
}
