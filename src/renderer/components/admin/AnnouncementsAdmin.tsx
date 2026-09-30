import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ANNOUNCEMENT_LIMITS,
  Announcement,
  AnnouncementDisplay,
  AnnouncementInput,
  AnnouncementKind,
  AnnouncementPlatform,
  getBackend,
} from '../../../modules/backend';
import { errorMessage } from '../../../modules/account';
import { refreshRemoteConfig } from '../../../modules/remoteConfig';
import {
  KIND_META,
  KIND_ORDER,
  PLATFORM_LABEL,
  announcementState,
  isSafeLink,
  isValidVersion,
  type AnnouncementState,
} from '../../../modules/announcements';
import { useToast } from '../ui/Toast';
import Spinner from '../ui/Spinner';
import { Field, Notice, Switch, ghostButtonClass, inputClass, primaryButtonClass } from '../account/formKit';
import { BannerView, ModalCardView } from '../announcements/AnnouncementViews';
import { STATE_LABEL, STATE_STYLE, formatWhen } from './format';
import { SectionLabel, Segmented, SmallButton, textareaClass } from './adminKit';

type Expiry = 'never' | '1h' | '24h' | '7d' | 'custom';
type StartMode = 'now' | 'later';
type Filter = 'all' | AnnouncementState;

interface Draft {
  kind: AnnouncementKind;
  display: AnnouncementDisplay;
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  active: boolean;
  startMode: StartMode;
  startsLocal: string;
  expiry: Expiry;
  expiresLocal: string;
  platform: AnnouncementPlatform;
  belowVersion: string;
}

const EXPIRY_MS: Record<'1h' | '24h' | '7d', number> = { '1h': 3600e3, '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3 };

const EMPTY: Draft = {
  kind: 'info', display: 'banner', title: '', body: '', linkUrl: '', linkLabel: '',
  active: true, startMode: 'now', startsLocal: '', expiry: 'never', expiresLocal: '',
  platform: 'all', belowVersion: '',
};

const RELEASES_URL = 'https://github.com/pedromoorales9/kageview/releases/latest';

/** Puntos de partida para los avisos más habituales. */
const TEMPLATES: Array<{ id: string; label: string; icon: string; make: (version: string) => Partial<Draft> }> = [
  {
    id: 'update', label: 'Nueva versión', icon: 'system_update_alt',
    make: (version) => ({
      kind: 'update', display: 'banner', title: 'Nueva versión disponible',
      body: 'Ya puedes actualizar KageView: novedades y mejoras te esperan.',
      linkUrl: RELEASES_URL, linkLabel: 'Descargar', belowVersion: version, expiry: '7d',
    }),
  },
  {
    id: 'maintenance', label: 'Mantenimiento', icon: 'build',
    make: () => ({
      kind: 'maintenance', display: 'modal', title: 'Mantenimiento programado',
      body: 'KageView estará en mantenimiento durante un rato. Guarda tu progreso antes de esa hora.',
      expiry: '24h',
    }),
  },
  {
    id: 'outage', label: 'Servicio caído', icon: 'warning',
    make: () => ({
      kind: 'warning', display: 'banner', title: 'Incidencia en un servidor',
      body: 'Algunos capítulos pueden no cargar. Estamos trabajando en ello; prueba otro servidor mientras tanto.',
      expiry: '24h',
    }),
  },
  {
    id: 'event', label: 'Evento / novedad', icon: 'celebration',
    make: () => ({ kind: 'event', display: 'banner', title: '', body: '', expiry: '7d' }),
  },
  {
    id: 'welcome', label: 'Bienvenida', icon: 'waving_hand',
    make: () => ({
      kind: 'info', display: 'modal', title: '¡Bienvenido a KageView!',
      body: 'Crea tu cuenta para guardar tu lista, añadir amigos y ver qué están viendo.',
    }),
  },
];

/** ISO → valor de <input type="datetime-local"> (hora local). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

function draftFrom(a: Announcement): Draft {
  const future = Date.parse(a.startsAt) > Date.now();
  return {
    kind: a.kind, display: a.display, title: a.title, body: a.body,
    linkUrl: a.linkUrl ?? '', linkLabel: a.linkLabel ?? '', active: a.active,
    startMode: future ? 'later' : 'now', startsLocal: toLocalInput(a.startsAt),
    expiry: a.expiresAt ? 'custom' : 'never', expiresLocal: toLocalInput(a.expiresAt),
    platform: a.platform, belowVersion: a.belowVersion ?? '',
  };
}

/** Convierte el borrador en la entrada del backend; devuelve errores legibles. */
function buildInput(d: Draft, editing: Announcement | null): { input?: AnnouncementInput; errors: string[] } {
  const errors: string[] = [];
  if (!d.body.trim()) errors.push('Escribe el mensaje del anuncio.');
  if (d.linkUrl.trim() && !/^https:\/\//i.test(d.linkUrl.trim())) errors.push('El enlace debe empezar por https://');
  else if (d.linkUrl.trim() && !isSafeLink(d.linkUrl.trim())) errors.push('El enlace no es una URL válida.');
  if (d.belowVersion.trim() && !isValidVersion(d.belowVersion.trim())) errors.push('La versión debe tener el formato 1.4.0');

  let startsAt: string | undefined;
  if (d.startMode === 'later') {
    const s = fromLocalInput(d.startsLocal);
    if (!s) errors.push('Elige cuándo se publica.');
    else startsAt = s;
  } else if (editing) {
    startsAt = editing.startsAt; // no se reinicia la fecha al editar
  }
  const startMs = startsAt ? Date.parse(startsAt) : Date.now();

  let expiresAt: string | null = null;
  if (d.expiry === 'custom') {
    expiresAt = fromLocalInput(d.expiresLocal);
    if (!expiresAt) errors.push('Elige cuándo caduca.');
    else if (Date.parse(expiresAt) <= startMs) errors.push('La caducidad debe ser posterior a la publicación.');
  } else if (d.expiry !== 'never') {
    expiresAt = new Date(startMs + EXPIRY_MS[d.expiry]).toISOString();
  }
  if (errors.length) return { errors };
  return {
    errors,
    input: {
      kind: d.kind, display: d.display, title: d.title, body: d.body,
      linkUrl: d.linkUrl.trim() || null, linkLabel: d.linkLabel.trim() || null,
      active: d.active, startsAt, expiresAt,
      platform: d.platform, belowVersion: d.belowVersion.trim() || null,
    },
  };
}

function inputFrom(a: Announcement, over: Partial<AnnouncementInput> = {}): AnnouncementInput {
  return {
    kind: a.kind, display: a.display, title: a.title, body: a.body,
    linkUrl: a.linkUrl, linkLabel: a.linkLabel, active: a.active,
    startsAt: a.startsAt, expiresAt: a.expiresAt,
    platform: a.platform, belowVersion: a.belowVersion,
    ...over,
  };
}

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'live', label: 'En directo' },
  { id: 'scheduled', label: 'Programados' },
  { id: 'paused', label: 'Pausados' },
  { id: 'expired', label: 'Caducados' },
];

export default function AnnouncementsAdmin() {
  const toast = useToast();
  const [list, setList] = useState<Announcement[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [myVersion, setMyVersion] = useState('');

  useEffect(() => {
    window.electron?.getVersion?.().then((v) => setMyVersion(/^\d+\.\d+\.\d+$/.test(v) ? v : '')).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      setList(await getBackend()!.adminListAnnouncements());
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const afterChange = async () => { await Promise.all([load(), refreshRemoteConfig()]); };
  const reset = () => { setDraft(EMPTY); setEditing(null); setErrors([]); };

  const submit = async () => {
    const { input, errors: errs } = buildInput(draft, editing);
    setErrors(errs);
    if (!input || busy) return;
    setBusy(true);
    try {
      await getBackend()!.adminSaveAnnouncement(input, editing?.id);
      toast.success(editing ? 'Anuncio actualizado.' : draft.active ? 'Anuncio publicado.' : 'Borrador guardado.', 'Administración');
      reset();
      await afterChange();
    } catch (e) {
      setErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      toast.success(okMsg, 'Administración');
      await afterChange();
    } catch (e) {
      toast.error(errorMessage(e), 'Administración');
    }
  };

  const toggleActive = (a: Announcement) =>
    run(() => getBackend()!.adminSaveAnnouncement(inputFrom(a, { active: !a.active }), a.id), a.active ? 'Anuncio pausado.' : 'Anuncio activado.');

  /** Copia nueva (la ven de nuevo quienes descartaron el original) y pausa el original. */
  const resend = (a: Announcement) =>
    run(async () => {
      const b = getBackend()!;
      await b.adminSaveAnnouncement(inputFrom(a, { active: true, startsAt: new Date().toISOString(), expiresAt: null }));
      if (a.active) await b.adminSaveAnnouncement(inputFrom(a, { active: false }), a.id);
    }, 'Anuncio reenviado a todos.');

  const remove = (a: Announcement) =>
    run(() => getBackend()!.adminDeleteAnnouncement(a.id), 'Anuncio eliminado.').finally(() => setConfirmDelete(null));

  /** Carga el anuncio como borrador NUEVO (sin editar el original). */
  const duplicate = (a: Announcement) => {
    setEditing(null);
    setDraft({ ...draftFrom(a), active: true, startMode: 'now', startsLocal: '', expiry: 'never', expiresLocal: '' });
    setErrors([]);
    toast.info('Copia cargada en el editor.', 'Administración');
  };

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setEditing(null);
    setDraft({ ...EMPTY, ...t.make(myVersion) });
    setErrors([]);
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, live: 0, scheduled: 0, paused: 0, expired: 0 };
    for (const a of list ?? []) { c.all++; c[announcementState(a)]++; }
    return c;
  }, [list]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list ?? []).filter(
      (a) => (filter === 'all' || announcementState(a) === filter) &&
        (!q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q))
    );
  }, [list, filter, search]);

  const meta = KIND_META[draft.kind];
  const previewLike = {
    kind: draft.kind,
    title: draft.title,
    body: draft.body || 'Aquí aparecerá el texto de tu anuncio.',
    linkUrl: draft.linkUrl.trim() || null,
    linkLabel: draft.linkLabel.trim() || null,
  };

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
      {/* ── Editor ─────────────────────────────────────── */}
      <section className="panel p-6 flex flex-col gap-5 self-start">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>{editing ? `Editando anuncio #${editing.id}` : 'Nuevo anuncio'}</SectionLabel>
          {editing && <SmallButton onClick={reset}>Cancelar edición</SmallButton>}
        </div>

        {!editing && (
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-on-surface-variant">Empezar desde una plantilla</span>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t.id)}
                  className="h-8 px-3 rounded-full text-[12.5px] font-medium flex items-center gap-1.5 bg-white/[0.06] text-on-surface-variant hover:text-white hover:bg-white/[0.12] transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium text-on-surface-variant">Tipo</span>
          <div className="flex flex-wrap gap-2">
            {KIND_ORDER.map((k) => {
              const m = KIND_META[k];
              const on = draft.kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => set('kind', k)}
                  aria-pressed={on}
                  className={`h-9 px-3.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition-all ring-1 ${
                    on ? `${m.tint} ${m.ring} ${m.text}` : 'ring-transparent bg-white/[0.06] text-on-surface-variant hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">{m.icon}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium text-on-surface-variant">Cómo se muestra</span>
          <Segmented
            label="Formato"
            value={draft.display}
            onChange={(v) => set('display', v)}
            options={[
              { value: 'banner', label: 'Banner', icon: 'view_headline' },
              { value: 'modal', label: 'Ventana emergente', icon: 'web_asset' },
            ]}
          />
          <p className="text-[12px] text-muted leading-snug">
            {draft.display === 'banner'
              ? 'Franja bajo la barra superior; cada persona puede descartarla.'
              : 'Ventana centrada que se ve una vez al abrir la app. Úsala solo para avisos importantes.'}
          </p>
        </div>

        <Field
          label="Título (opcional)"
          value={draft.title}
          maxLength={ANNOUNCEMENT_LIMITS.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Novedades de la 1.5"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ann-body" className="text-[12.5px] font-medium text-on-surface-variant">Mensaje</label>
          <textarea
            id="ann-body"
            value={draft.body}
            onChange={(e) => set('body', e.target.value)}
            maxLength={ANNOUNCEMENT_LIMITS.body}
            rows={4}
            placeholder="Qué quieres contarle a todos los usuarios…"
            className={textareaClass}
          />
          <p className="text-[12px] text-muted text-right tabular-nums">{draft.body.length}/{ANNOUNCEMENT_LIMITS.body}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-3">
          <Field
            label="Enlace (opcional)"
            value={draft.linkUrl}
            maxLength={ANNOUNCEMENT_LIMITS.linkUrl}
            onChange={(e) => set('linkUrl', e.target.value)}
            placeholder="https://…"
            spellCheck={false}
          />
          <Field
            label="Texto del botón"
            value={draft.linkLabel}
            maxLength={ANNOUNCEMENT_LIMITS.linkLabel}
            onChange={(e) => set('linkLabel', e.target.value)}
            placeholder="Saber más"
            disabled={!draft.linkUrl.trim()}
          />
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-[12.5px] font-medium text-on-surface-variant">Quién lo ve</span>
          <div className="flex flex-wrap items-end gap-3">
            <select
              aria-label="Sistema operativo"
              value={draft.platform}
              onChange={(e) => set('platform', e.target.value as AnnouncementPlatform)}
              className="h-10 px-3 rounded-xl bg-white/[0.06] text-white text-[13.5px] outline-none shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] cursor-pointer [color-scheme:dark]"
            >
              {(Object.keys(PLATFORM_LABEL) as AnnouncementPlatform[]).map((p) => (
                <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label htmlFor="ann-below" className="text-[13px] text-on-surface-variant whitespace-nowrap">Versiones anteriores a</label>
              <input
                id="ann-below"
                value={draft.belowVersion}
                onChange={(e) => set('belowVersion', e.target.value.trim())}
                placeholder="todas"
                maxLength={11}
                spellCheck={false}
                className={`${inputClass} !h-10 !w-[96px] !text-[13.5px]`}
              />
              {myVersion && draft.belowVersion !== myVersion && (
                <SmallButton onClick={() => set('belowVersion', myVersion)} title="Solo lo verá quien tenga una versión anterior a la tuya">
                  Usar v{myVersion}
                </SmallButton>
              )}
            </div>
          </div>
          <p className="text-[12px] text-muted leading-snug">
            Por ejemplo, «Nueva versión» solo a quien aún no la tiene. Estos filtros los aplican las apps con la
            actualización más reciente; las versiones anteriores mostrarán el anuncio a todos.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-[12.5px] font-medium text-on-surface-variant">Calendario</span>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Publicación"
              value={draft.startMode}
              onChange={(v) => set('startMode', v)}
              options={[
                { value: 'now', label: editing ? 'Fecha actual' : 'Ahora' },
                { value: 'later', label: 'Programar' },
              ]}
            />
            {draft.startMode === 'later' && (
              <input
                type="datetime-local"
                aria-label="Fecha de publicación"
                value={draft.startsLocal}
                onChange={(e) => set('startsLocal', e.target.value)}
                className="h-10 px-3 rounded-xl bg-white/[0.06] text-white text-[13.5px] outline-none shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] [color-scheme:dark]"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[13px] text-on-surface-variant" htmlFor="ann-expiry">Caduca</label>
            <select
              id="ann-expiry"
              value={draft.expiry}
              onChange={(e) => set('expiry', e.target.value as Expiry)}
              className="h-10 px-3 rounded-xl bg-white/[0.06] text-white text-[13.5px] outline-none shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] cursor-pointer [color-scheme:dark]"
            >
              <option value="never">Nunca</option>
              <option value="1h">A la hora</option>
              <option value="24h">A las 24 horas</option>
              <option value="7d">A los 7 días</option>
              <option value="custom">En una fecha…</option>
            </select>
            {draft.expiry === 'custom' && (
              <input
                type="datetime-local"
                aria-label="Fecha de caducidad"
                value={draft.expiresLocal}
                onChange={(e) => set('expiresLocal', e.target.value)}
                className="h-10 px-3 rounded-xl bg-white/[0.06] text-white text-[13.5px] outline-none shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] [color-scheme:dark]"
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-white font-medium">Publicado</p>
            <p className="text-[12.5px] text-muted leading-snug">Si lo desactivas queda como borrador y nadie lo ve.</p>
          </div>
          <Switch checked={draft.active} onChange={(v) => set('active', v)} label="Publicado" />
        </div>

        {errors.length > 0 && (
          <Notice kind="error">
            <ul className="list-disc pl-4 space-y-0.5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Notice>
        )}

        <div className="flex flex-wrap gap-3">
          <button onClick={submit} disabled={busy} className={primaryButtonClass}>
            {busy ? <Spinner size={18} /> : <span className="material-symbols-outlined text-[19px]">campaign</span>}
            {editing ? 'Guardar cambios' : draft.active ? 'Publicar anuncio' : 'Guardar borrador'}
          </button>
          {(editing || draft.body || draft.title) && (
            <button onClick={reset} className={ghostButtonClass}>Limpiar</button>
          )}
        </div>
      </section>

      {/* ── Vista previa + historial ───────────────────── */}
      <div className="flex flex-col gap-6 min-w-0">
        <section className="panel p-6 flex flex-col gap-4">
          <SectionLabel>Vista previa</SectionLabel>
          {draft.display === 'banner' ? (
            <BannerView a={previewLike} onLink={() => undefined} />
          ) : (
            <div className="flex justify-center">
              <ModalCardView a={previewLike} onLink={() => undefined} dismissLabel="Entendido" />
            </div>
          )}
          <p className={`text-[12px] leading-snug ${meta.text}`}>
            Así lo verán los usuarios de KageView (con o sin sesión iniciada)
            {draft.platform !== 'all' ? ` · ${PLATFORM_LABEL[draft.platform].toLowerCase()}` : ''}
            {draft.belowVersion ? ` · versiones anteriores a ${draft.belowVersion}` : ''}.
          </p>
        </section>

        <section className="panel p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Anuncios</SectionLabel>
            <SmallButton onClick={() => void load()}>
              <span className="material-symbols-outlined text-[15px]">refresh</span>Actualizar
            </SmallButton>
          </div>

          {list && list.length > 0 && (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en títulos y mensajes…"
                aria-label="Buscar anuncios"
                className={`${inputClass} !h-9 !text-[13.5px]`}
              />
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por estado">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`h-8 px-3 rounded-full text-[12.5px] font-medium flex items-center gap-1.5 transition-colors ${
                      filter === f.id ? 'bg-white/[0.16] text-white' : 'bg-white/[0.06] text-on-surface-variant hover:text-white'
                    }`}
                  >
                    {f.label}
                    <span className="text-[11px] text-muted tabular-nums">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {loadError ? (
            <Notice kind="error">{loadError}</Notice>
          ) : list === null ? (
            <div className="flex justify-center py-8"><Spinner size={24} /></div>
          ) : list.length === 0 ? (
            <p className="text-[13.5px] text-muted py-6 text-center">Todavía no hay anuncios. Crea el primero desde el formulario.</p>
          ) : visible.length === 0 ? (
            <p className="text-[13.5px] text-muted py-6 text-center">Ningún anuncio coincide con el filtro.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visible.map((a) => {
                const st = announcementState(a);
                const m = KIND_META[a.kind];
                return (
                  <li key={a.id} className="rounded-2xl bg-white/[0.04] hairline p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <span className={`material-symbols-outlined text-[20px] mt-0.5 ${m.text}`}>{m.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-semibold text-white truncate max-w-full">{a.title || m.label}</p>
                          <span className={`h-5 px-2 rounded-full text-[10.5px] font-bold uppercase tracking-[0.06em] inline-flex items-center ${STATE_STYLE[st]}`}>
                            {STATE_LABEL[st]}
                          </span>
                          <span className="h-5 px-2 rounded-full text-[10.5px] font-medium inline-flex items-center bg-white/[0.06] text-muted">
                            {a.display === 'banner' ? 'Banner' : 'Ventana'}
                          </span>
                          {a.platform !== 'all' && (
                            <span className="h-5 px-2 rounded-full text-[10.5px] font-medium inline-flex items-center bg-white/[0.06] text-muted">
                              {PLATFORM_LABEL[a.platform]}
                            </span>
                          )}
                          {a.belowVersion && (
                            <span className="h-5 px-2 rounded-full text-[10.5px] font-medium inline-flex items-center bg-white/[0.06] text-muted">
                              {'< '}v{a.belowVersion}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-on-surface-variant leading-snug mt-1 line-clamp-3 break-words whitespace-pre-line">{a.body}</p>
                        <p className="text-[11.5px] text-muted mt-2">
                          {st === 'scheduled' ? 'Se publica ' : 'Desde '}{formatWhen(a.startsAt)}
                          {a.expiresAt ? ` · caduca ${formatWhen(a.expiresAt)}` : ' · sin caducidad'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      {confirmDelete === a.id ? (
                        <>
                          <span className="text-[12.5px] text-on-surface-variant self-center mr-1">¿Eliminar definitivamente?</span>
                          <SmallButton onClick={() => setConfirmDelete(null)}>No</SmallButton>
                          <SmallButton tone="danger" onClick={() => void remove(a)}>Sí, eliminar</SmallButton>
                        </>
                      ) : (
                        <>
                          <SmallButton onClick={() => { setEditing(a); setDraft(draftFrom(a)); setErrors([]); }}>Editar</SmallButton>
                          <SmallButton onClick={() => void toggleActive(a)}>{a.active ? 'Pausar' : 'Activar'}</SmallButton>
                          <SmallButton onClick={() => duplicate(a)} title="Carga una copia en el editor">Duplicar</SmallButton>
                          <SmallButton onClick={() => void resend(a)} title="Crea una copia para que la vean de nuevo quienes ya la descartaron">
                            Reenviar
                          </SmallButton>
                          <SmallButton tone="danger" onClick={() => setConfirmDelete(a.id)}>Eliminar</SmallButton>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
