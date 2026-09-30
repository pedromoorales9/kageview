import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH, ChatMessage, Friend, MangaShare } from '../../../modules/backend';
import {
  closeConversation,
  discardMessage,
  loadOlder,
  messagePreview,
  openConversation,
  removeMessage,
  retryMessage,
  sendText,
  useChatStore,
} from '../../../modules/chat';
import { isWatchingNow, useSocialStore } from '../../../modules/social';
import { useAppStore } from '../../../modules/store';
import Avatar from '../account/Avatar';
import CoverImage from '../ui/CoverImage';
import Spinner from '../ui/Spinner';

// ─── Fechas ────────────────────────────────────────────────
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yesterday)) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

/** Hora si es de hoy, "Ayer", o fecha corta (para la lista de conversaciones). */
function shortWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return hhmm(iso);
  if (sameDay(d, yesterday)) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ─── Burbuja ───────────────────────────────────────────────
function AnimeShare({ m, mine, onOpen }: { m: ChatMessage; mine: boolean; onOpen: (id: number) => void }) {
  const media = m.media!;
  const title = media.title.english || media.title.romaji;
  return (
    <button
      onClick={() => onOpen(media.id)}
      className={`group flex items-center gap-3 p-2.5 pr-4 rounded-2xl text-left w-[250px] transition-colors ${
        mine ? 'bg-white/[0.16] hover:bg-white/[0.22]' : 'bg-white/[0.07] hover:bg-white/[0.12]'
      } ring-[0.5px] ring-white/15`}
      title="Abrir ficha del anime"
    >
      <CoverImage src={media.coverImage.large} className="w-[46px] h-[66px] rounded-lg flex-none ring-[0.5px] ring-white/15" />
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/60">Anime compartido</span>
        <span className="block text-[13.5px] font-semibold text-white leading-snug line-clamp-2">{title}</span>
        {media.episodes ? <span className="block text-[11.5px] text-white/60 mt-0.5">{media.episodes} episodios</span> : null}
      </span>
      <span className="material-symbols-outlined text-[18px] text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-all">chevron_right</span>
    </button>
  );
}

function MangaShareCard({ m, mine, onOpen }: { m: ChatMessage; mine: boolean; onOpen: (s: MangaShare) => void }) {
  const manga = m.manga!;
  return (
    <button
      onClick={() => onOpen(manga)}
      className={`group flex items-center gap-3 p-2.5 pr-4 rounded-2xl text-left w-[250px] transition-colors ${
        mine ? 'bg-white/[0.16] hover:bg-white/[0.22]' : 'bg-white/[0.07] hover:bg-white/[0.12]'
      } ring-[0.5px] ring-white/15`}
      title="Abrir ficha del manga"
    >
      <CoverImage src={manga.coverUrl} className="w-[46px] h-[66px] rounded-lg flex-none ring-[0.5px] ring-white/15" />
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/60">Manga compartido</span>
        <span className="block text-[13.5px] font-semibold text-white leading-snug line-clamp-2">{manga.title}</span>
        {manga.lastChapter ? <span className="block text-[11.5px] text-white/60 mt-0.5">{manga.lastChapter} capítulos</span> : null}
      </span>
      <span className="material-symbols-outlined text-[18px] text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-all">chevron_right</span>
    </button>
  );
}

interface BubbleProps {
  m: ChatMessage;
  mine: boolean;
  showTime: boolean;
  showAvatar: boolean;
  friend: Friend['profile'];
  receipt: string | null;
  onOpenAnime: (id: number) => void;
  onOpenManga: (s: MangaShare) => void;
  onDelete: (m: ChatMessage) => void;
  onRetry: (m: ChatMessage) => void;
  onDiscard: (m: ChatMessage) => void;
}

function Bubble({ m, mine, showTime, showAvatar, friend, receipt, onOpenAnime, onOpenManga, onDelete, onRetry, onDiscard }: BubbleProps) {
  const [confirming, setConfirming] = useState(false);

  const body = m.deleted ? (
    <div className="px-3.5 py-2 rounded-[18px] text-[13px] italic text-muted ring-1 ring-white/10 ring-inset">Mensaje eliminado</div>
  ) : m.kind === 'anime' && m.media ? (
    <AnimeShare m={m} mine={mine} onOpen={onOpenAnime} />
  ) : m.kind === 'manga' && m.manga ? (
    <MangaShareCard m={m} mine={mine} onOpen={onOpenManga} />
  ) : (
    <div
      className={`px-3.5 py-2 text-[14.5px] leading-[1.35] whitespace-pre-wrap break-words max-w-[520px] ${
        mine
          ? 'bg-gradient-to-b from-[#ff5570] to-[#d81e42] text-white rounded-[18px] rounded-br-[6px] shadow-[0_6px_18px_-8px_rgba(255,61,90,0.7)]'
          : 'bg-white/[0.09] text-on-surface rounded-[18px] rounded-bl-[6px] ring-[0.5px] ring-white/10'
      } ${m.pending ? 'opacity-60' : ''} ${m.failed ? 'ring-1 ring-error/60' : ''}`}
    >
      {m.body}
    </div>
  );

  return (
    <div className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && (showAvatar ? <Avatar profile={friend} size={26} /> : <div className="w-[26px] flex-none" />)}
      <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} min-w-0`}>
        <div className="flex items-center gap-1.5">
          {mine && !m.deleted && !m.pending && !m.failed && (
            confirming ? (
              <span className="flex items-center gap-1.5 text-[12px] mr-1">
                <button onClick={() => { setConfirming(false); onDelete(m); }} className="text-error font-semibold hover:underline">Eliminar</button>
                <button onClick={() => setConfirming(false)} className="text-muted hover:text-white">Cancelar</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                aria-label="Eliminar mensaje"
                title="Eliminar mensaje"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-error hover:bg-error/10 transition-all"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
              </button>
            )
          )}
          {body}
        </div>
        {(showTime || receipt || m.pending || m.failed) && (
          <div className="mt-1 px-1 text-[11px] text-muted flex items-center gap-2">
            {m.failed ? (
              <>
                <span className="text-error">No enviado</span>
                <button onClick={() => onRetry(m)} className="text-secondary hover:text-white font-medium">Reintentar</button>
                <button onClick={() => onDiscard(m)} className="hover:text-white">Descartar</button>
              </>
            ) : m.pending ? (
              <span>Enviando…</span>
            ) : (
              <>
                {showTime && <span>{hhmm(m.createdAt)}</span>}
                {receipt && <span className={receipt === 'Leído' ? 'text-secondary' : ''}>{receipt}</span>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Hilo ──────────────────────────────────────────────────
function Thread({ friend, onOpenAnime, onOpenManga }: { friend: Friend; onOpenAnime: (id: number) => void; onOpenManga: (s: MangaShare) => void }) {
  const me = useAppStore((s) => s.account.user?.id);
  const messages = useChatStore((s) => s.threads[friend.profile.id]);
  const hasMore = useChatStore((s) => s.hasMore[friend.profile.id]);
  const loading = useChatStore((s) => s.loadingThread[friend.profile.id]);
  const activity = useSocialStore((s) => s.activity.find((a) => a.userId === friend.profile.id));

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const drafts = useRef<Record<string, string>>({});
  const [text, setText] = useState('');
  const [showJump, setShowJump] = useState(false);
  const id = friend.profile.id;

  // Borrador por conversación
  useEffect(() => {
    setText(drafts.current[id] ?? '');
    stickRef.current = true;
    setShowJump(false);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      drafts.current[id] = inputRef.current?.value ?? '';
    };
  }, [id]);

  // Autoscroll: solo si ya estabas abajo o el mensaje es tuyo
  const lastId = messages?.length ? messages[messages.length - 1].id : 0;
  const lastMine = messages?.length ? messages[messages.length - 1].senderId === me : false;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickRef.current || lastMine) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
    } else {
      setShowJump(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, messages?.length === 0]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near;
    if (near) setShowJump(false);
  };

  const jumpToEnd = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const older = async () => {
    const el = scrollRef.current;
    const prev = el?.scrollHeight ?? 0;
    await loadOlder(id);
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prev; // mantiene la posición al insertar arriba
    });
  };

  // Autoajuste de la altura del campo de texto
  const resize = () => {
    const t = inputRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 132)}px`;
  };
  useEffect(resize, [text]);

  const submit = () => {
    if (!text.trim() || text.length > CHAT_MAX_LENGTH) return;
    if (sendText(id, text)) {
      setText('');
      drafts.current[id] = '';
      stickRef.current = true;
    }
  };

  // Mensajes con separadores de día y agrupación
  const rows = useMemo(() => {
    const list = messages ?? [];
    const lastMineIdx = (() => {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].senderId === me && !list[i].failed) return i;
      return -1;
    })();
    return list.map((m, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const newDay = !prev || !sameDay(new Date(prev.createdAt), new Date(m.createdAt));
      const groupEnd =
        !next ||
        next.senderId !== m.senderId ||
        new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > 5 * 60_000 ||
        !sameDay(new Date(next.createdAt), new Date(m.createdAt));
      return { m, newDay, groupEnd, receipt: i === lastMineIdx && !m.deleted && !m.pending ? (m.readAt ? 'Leído' : 'Enviado') : null };
    });
  }, [messages, me]);

  const watching = activity && isWatchingNow(activity);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Cabecera */}
      <div className="flex-none h-[64px] px-5 flex items-center gap-3 border-b-[0.5px] border-white/[0.08]">
        <Avatar profile={friend.profile} size={38} />
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-white truncate">{friend.profile.displayName || friend.profile.username}</p>
          <p className="text-[12px] text-muted truncate flex items-center gap-1.5">
            {watching ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#35e66a] shadow-[0_0_6px_#35e66a] flex-none" />
                Viendo {activity!.title} · ep. {activity!.episode}
              </>
            ) : (
              <>@{friend.profile.username}</>
            )}
          </p>
        </div>
      </div>

      {/* Mensajes */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Mensajes" className="absolute inset-0 overflow-y-auto px-5 py-4">
          {hasMore && (
            <div className="flex justify-center mb-3">
              <button onClick={older} disabled={loading} className="h-8 px-4 rounded-full text-[12.5px] font-medium bg-white/[0.07] hover:bg-white/[0.13] text-on-surface-variant hover:text-white transition-colors disabled:opacity-50">
                {loading ? 'Cargando…' : 'Cargar mensajes anteriores'}
              </button>
            </div>
          )}
          {messages === undefined || (loading && messages.length === 0) ? (
            <div className="h-full flex items-center justify-center"><Spinner size={28} /></div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] opacity-50">waving_hand</span>
              <p className="text-[14px]">Aún no hay mensajes</p>
              <p className="text-[12.5px] text-muted">Saluda a {friend.profile.displayName || friend.profile.username} 👋</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {rows.map(({ m, newDay, groupEnd, receipt }) => (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div className="flex justify-center my-4">
                      <span className="text-[11.5px] font-medium text-muted px-3 py-1 rounded-full bg-white/[0.05]">{dayLabel(m.createdAt)}</span>
                    </div>
                  )}
                  <div className={groupEnd ? 'mb-3' : 'mb-[3px]'}>
                    <Bubble
                      m={m}
                      mine={m.senderId === me}
                      showTime={groupEnd}
                      showAvatar={groupEnd}
                      friend={friend.profile}
                      receipt={receipt}
                      onOpenAnime={onOpenAnime}
                      onOpenManga={onOpenManga}
                      onDelete={(x) => void removeMessage(id, x.id)}
                      onRetry={(x) => retryMessage(id, x.id)}
                      onDiscard={(x) => discardMessage(id, x.id)}
                    />
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
        {showJump && (
          <button onClick={jumpToEnd} className="absolute bottom-3 left-1/2 -translate-x-1/2 h-8 px-4 rounded-full btn-moon text-[12.5px] font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
            Mensajes nuevos
          </button>
        )}
      </div>

      {/* Escribir */}
      <div className="flex-none px-4 pb-4 pt-2">
        <div className="flex items-end gap-2 rounded-[22px] bg-white/[0.06] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] focus-within:shadow-[inset_0_0_0_1.5px_rgba(255,61,90,0.6),0_0_0_4px_rgba(255,61,90,0.12)] transition-shadow pl-4 pr-1.5 py-1.5">
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Mayús+Enter salto de línea; no interferir con la composición (IME)
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            aria-label={`Mensaje para ${friend.profile.username}`}
            placeholder="Escribe un mensaje…"
            className="flex-1 bg-transparent outline-none resize-none text-[14.5px] leading-[1.35] text-white placeholder:text-muted py-[7px] max-h-[132px]"
          />
          {text.length > CHAT_MAX_LENGTH - 200 && (
            <span className={`text-[11px] tabular-nums self-center ${text.length > CHAT_MAX_LENGTH ? 'text-error' : 'text-muted'}`}>
              {text.length}/{CHAT_MAX_LENGTH}
            </span>
          )}
          <button
            onClick={submit}
            disabled={!text.trim() || text.length > CHAT_MAX_LENGTH}
            aria-label="Enviar"
            className="btn-moon w-9 h-9 rounded-full flex-none flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined filled text-[19px]">arrow_upward</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────
export default function ChatPanel({ onOpenAnime, onOpenManga }: { onOpenAnime: (mediaId: number) => void; onOpenManga: (s: MangaShare) => void }) {
  const friends = useSocialStore((s) => s.friends);
  const summaries = useChatStore((s) => s.summaries);
  const activeId = useChatStore((s) => s.activeFriendId);
  const pendingOpen = useChatStore((s) => s.pendingOpen);

  // Conversaciones con mensajes primero (más recientes arriba); luego el resto de amigos
  const ordered = useMemo(() => {
    return [...friends].sort((a, b) => {
      const la = summaries[a.profile.id]?.last.createdAt;
      const lb = summaries[b.profile.id]?.last.createdAt;
      if (la && lb) return lb.localeCompare(la);
      if (la) return -1;
      if (lb) return 1;
      return a.profile.username.localeCompare(b.profile.username);
    });
  }, [friends, summaries]);

  // Abrir una conversación pedida desde otra pantalla
  useEffect(() => {
    if (pendingOpen) void openConversation(pendingOpen);
  }, [pendingOpen]);

  // Al salir de la sección no se queda "leyendo" en segundo plano
  useEffect(() => () => closeConversation(), []);

  const active = ordered.find((f) => f.profile.id === activeId) ?? null;
  const select = useCallback((f: Friend) => void openConversation(f.profile.id), []);

  if (friends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-16">
        <div className="w-16 h-16 rounded-full bg-white/[0.06] hairline flex items-center justify-center">
          <span className="material-symbols-outlined text-[30px] text-muted">chat_bubble</span>
        </div>
        <p className="text-[15px] font-semibold text-white">Aún no tienes con quién chatear</p>
        <p className="text-[13.5px] text-on-surface-variant max-w-sm leading-snug">Añade amigos en la pestaña <b className="text-white">Añadir</b> y podréis hablar y recomendaros anime aquí.</p>
      </div>
    );
  }

  return (
    <div className="panel flex overflow-hidden h-[calc(100vh-230px)] min-h-[520px]">
      {/* Conversaciones */}
      <div className="w-[300px] flex-none border-r-[0.5px] border-white/[0.08] overflow-y-auto">
        {ordered.map((f) => {
          const s = summaries[f.profile.id];
          const isActive = f.profile.id === activeId;
          return (
            <button
              key={f.friendshipId}
              onClick={() => select(f)}
              aria-current={isActive}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? 'bg-primary/[0.14]' : 'hover:bg-white/[0.05]'}`}
            >
              <Avatar profile={f.profile} size={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`text-[14px] truncate ${s?.unread ? 'font-bold text-white' : 'font-semibold text-on-surface'}`}>
                    {f.profile.displayName || f.profile.username}
                  </span>
                  {s && <span className="ml-auto text-[11px] text-muted flex-none tabular-nums">{shortWhen(s.last.createdAt)}</span>}
                </span>
                <span className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[12.5px] truncate flex-1 ${s?.unread ? 'text-on-surface' : 'text-muted'}`}>
                    {s ? `${s.last.senderId === f.profile.id ? '' : 'Tú: '}${messagePreview(s.last)}` : 'Sin mensajes'}
                  </span>
                  {s?.unread ? (
                    <span className="min-w-[19px] h-[19px] px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center shadow-moon flex-none">
                      {s.unread}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Conversación */}
      {active ? (
        <Thread key={active.profile.id} friend={active} onOpenAnime={onOpenAnime} onOpenManga={onOpenManga} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-on-surface-variant">
          <div className="w-16 h-16 rounded-full bg-white/[0.06] hairline flex items-center justify-center">
            <span className="material-symbols-outlined text-[30px] text-muted">forum</span>
          </div>
          <p className="text-[14px]">Elige una conversación</p>
        </div>
      )}
    </div>
  );
}
