import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../modules/store';
import { errorMessage, openAuth } from '../../modules/account';
import { getBackend, Friend, FriendRequest, PublicProfile } from '../../modules/backend';
import { isWatchingNow, refreshSocial, timeAgo, useSocialStore } from '../../modules/social';
import { AniListAnime } from '../../types/types';
import useAniList from '../hooks/useAniList';
import Avatar from '../components/account/Avatar';
import FriendProfileModal from '../components/social/FriendProfileModal';
import ChatPanel from '../components/social/ChatPanel';
import { requestOpenChat, useChatStore } from '../../modules/chat';
import { inputClass } from '../components/account/formKit';
import Spinner from '../components/ui/Spinner';
import CoverImage from '../components/ui/CoverImage';
import { useToast } from '../components/ui/Toast';

type Tab = 'friends' | 'chat' | 'requests' | 'add';

interface FriendsPageProps {
  onSelectAnime: (anime: AniListAnime) => void;
}

function EmptyState({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-16">
      <div className="w-16 h-16 rounded-full bg-white/[0.06] hairline flex items-center justify-center">
        <span className="material-symbols-outlined text-[30px] text-muted">{icon}</span>
      </div>
      <p className="text-[15px] font-semibold text-white">{title}</p>
      {children && <div className="text-[13.5px] text-on-surface-variant max-w-sm leading-snug">{children}</div>}
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  tone = 'neutral',
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'neutral' | 'danger';
  disabled?: boolean;
}) {
  const cls =
    tone === 'primary'
      ? 'bg-primary text-white shadow-moon hover:brightness-110'
      : tone === 'danger'
      ? 'bg-error/10 text-error hover:bg-error/20'
      : 'bg-white/[0.08] text-white hover:bg-white/[0.15]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${cls}`}
    >
      {children}
    </button>
  );
}

// ─── Pestaña: Amigos ───────────────────────────────────────
function FriendsTab({
  onOpenFriend,
  onOpenAnime,
  onMessage,
}: {
  onOpenFriend: (f: Friend) => void;
  onOpenAnime: (mediaId: number) => void;
  onMessage: (f: Friend) => void;
}) {
  const toast = useToast();
  const friends = useSocialStore((s) => s.friends);
  const activity = useSocialStore((s) => s.activity);
  const loaded = useSocialStore((s) => s.loaded);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const byUser = useMemo(() => new Map(activity.map((a) => [a.userId, a])), [activity]);
  const watching = activity.filter(isWatchingNow);

  const remove = async (f: Friend) => {
    try {
      await getBackend()!.removeFriend(f.friendshipId);
      toast.info(`Has eliminado a ${f.profile.displayName || f.profile.username}.`);
      setConfirmId(null);
      void refreshSocial();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (!loaded) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  if (friends.length === 0) {
    return (
      <EmptyState icon="group_add" title="Aún no tienes amigos">
        Ve a la pestaña <b className="text-white">Añadir</b> y busca a tus amigos por su nombre de usuario.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Viendo ahora */}
      <section>
        <h2 className="section-title font-headline text-[20px] font-bold text-white tracking-[-0.025em] mb-5">Viendo ahora</h2>
        {watching.length === 0 ? (
          <p className="text-[13.5px] text-muted">Ninguno de tus amigos está viendo algo ahora mismo.</p>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {watching.map((a) => (
              <button
                key={a.userId}
                onClick={() => onOpenAnime(a.mediaId)}
                className="group panel p-3.5 flex items-center gap-3.5 text-left transition-transform duration-300 ease-mac hover:-translate-y-0.5"
              >
                <CoverImage src={a.coverUrl} className="w-[52px] h-[74px] rounded-lg flex-none ring-[0.5px] ring-white/15" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar profile={a.profile} size={22} />
                    <span className="text-[13px] font-semibold text-white truncate">
                      {a.profile.displayName || a.profile.username}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#5cf08a] flex-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#35e66a] shadow-[0_0_6px_#35e66a]" />
                      En directo
                    </span>
                  </div>
                  <p className="text-[13.5px] text-on-surface truncate group-hover:text-white transition-colors">{a.title}</p>
                  <p className="text-[12px] text-muted">
                    Episodio {a.episode}{a.totalEpisodes ? ` de ${a.totalEpisodes}` : ''} · {timeAgo(a.updatedAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Todos */}
      <section>
        <h2 className="section-title font-headline text-[20px] font-bold text-white tracking-[-0.025em] mb-5">
          Todos tus amigos <span className="text-muted font-normal text-[15px]">{friends.length}</span>
        </h2>
        <div className="panel divide-y-[0.5px] divide-white/[0.08] overflow-hidden">
          {friends.map((f) => {
            const a = byUser.get(f.profile.id);
            const now = a && isWatchingNow(a);
            return (
              <div key={f.friendshipId} className="flex items-center gap-3.5 px-4 py-3">
                <button onClick={() => onOpenFriend(f)} className="flex items-center gap-3.5 min-w-0 flex-1 text-left group">
                  <Avatar profile={f.profile} size={44} />
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-white truncate group-hover:text-secondary transition-colors">
                      {f.profile.displayName || f.profile.username}
                      <span className="ml-2 text-[12.5px] font-normal text-muted">@{f.profile.username}</span>
                    </p>
                    <p className="text-[12.5px] text-on-surface-variant truncate">
                      {a
                        ? now
                          ? <>Viendo <span className="text-white">{a.title}</span> · ep. {a.episode}</>
                          : <>Vio <span className="text-on-surface">{a.title}</span> · {timeAgo(a.updatedAt)}</>
                        : 'Sin actividad reciente'}
                    </p>
                  </div>
                </button>
                {confirmId === f.friendshipId ? (
                  <div className="flex items-center gap-2 flex-none">
                    <span className="text-[12.5px] text-muted">¿Eliminar?</span>
                    <SmallButton tone="danger" onClick={() => remove(f)}>Sí, eliminar</SmallButton>
                    <SmallButton onClick={() => setConfirmId(null)}>No</SmallButton>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-none">
                    <SmallButton tone="primary" onClick={() => onMessage(f)}>Mensaje</SmallButton>
                    <SmallButton onClick={() => onOpenFriend(f)}>Ver perfil</SmallButton>
                    <button
                      onClick={() => setConfirmId(f.friendshipId)}
                      aria-label={`Eliminar a ${f.profile.username}`}
                      title="Eliminar amigo"
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">person_remove</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─── Pestaña: Solicitudes ──────────────────────────────────
function RequestsTab() {
  const toast = useToast();
  const requests = useSocialStore((s) => s.requests);
  const loaded = useSocialStore((s) => s.loaded);
  const [busyId, setBusyId] = useState<number | null>(null);

  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');

  const respond = async (r: FriendRequest, accept: boolean) => {
    setBusyId(r.id);
    try {
      await getBackend()!.respondToFriendRequest(r.id, accept);
      toast[accept ? 'success' : 'info'](
        accept ? `Ahora eres amigo de ${r.profile.displayName || r.profile.username}.` : 'Solicitud rechazada.'
      );
      await refreshSocial();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (r: FriendRequest) => {
    setBusyId(r.id);
    try {
      await getBackend()!.removeFriend(r.id);
      await refreshSocial();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (!loaded) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  if (requests.length === 0) {
    return <EmptyState icon="mark_email_unread" title="No tienes solicitudes pendientes" />;
  }

  const Row = ({ r, children }: { r: FriendRequest; children: React.ReactNode }) => (
    <div className="flex items-center gap-3.5 px-4 py-3">
      <Avatar profile={r.profile} size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-white truncate">
          {r.profile.displayName || r.profile.username}
          <span className="ml-2 text-[12.5px] font-normal text-muted">@{r.profile.username}</span>
        </p>
        <p className="text-[12.5px] text-muted">{timeAgo(r.createdAt)}</p>
      </div>
      <div className="flex items-center gap-2 flex-none">{children}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-10">
      {incoming.length > 0 && (
        <section>
          <h2 className="section-title font-headline text-[20px] font-bold text-white tracking-[-0.025em] mb-5">Recibidas</h2>
          <div className="panel divide-y-[0.5px] divide-white/[0.08] overflow-hidden">
            {incoming.map((r) => (
              <Row key={r.id} r={r}>
                <SmallButton tone="primary" disabled={busyId === r.id} onClick={() => respond(r, true)}>Aceptar</SmallButton>
                <SmallButton disabled={busyId === r.id} onClick={() => respond(r, false)}>Rechazar</SmallButton>
              </Row>
            ))}
          </div>
        </section>
      )}
      {outgoing.length > 0 && (
        <section>
          <h2 className="section-title font-headline text-[20px] font-bold text-white tracking-[-0.025em] mb-5">Enviadas</h2>
          <div className="panel divide-y-[0.5px] divide-white/[0.08] overflow-hidden">
            {outgoing.map((r) => (
              <Row key={r.id} r={r}>
                <span className="text-[12.5px] text-muted">Pendiente</span>
                <SmallButton disabled={busyId === r.id} onClick={() => cancel(r)}>Cancelar</SmallButton>
              </Row>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Pestaña: Añadir ───────────────────────────────────────
function AddTab() {
  const toast = useToast();
  const friends = useSocialStore((s) => s.friends);
  const requests = useSocialStore((s) => s.requests);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const friendIds = useMemo(() => new Set(friends.map((f) => f.profile.id)), [friends]);
  const pendingIds = useMemo(() => new Set(requests.map((r) => r.profile.id)), [requests]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const r = await getBackend()!.searchUsers(q);
        if (!cancelled) setResults(r);
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          toast.error(errorMessage(err));
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const send = useCallback(async (p: PublicProfile) => {
    setBusyId(p.id);
    try {
      const res = await getBackend()!.sendFriendRequest(p.id);
      setSent((s) => new Set(s).add(p.id));
      toast.success(
        res === 'accepted'
          ? `¡Ahora eres amigo de ${p.displayName || p.username}!`
          : `Solicitud enviada a ${p.displayName || p.username}.`
      );
      void refreshSocial();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[22px] text-muted pointer-events-none">
          person_search
        </span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca por nombre de usuario…"
          aria-label="Buscar usuarios"
          className={`${inputClass} !h-[52px] !pl-12 !text-[16px] !rounded-[14px]`}
        />
        {searching && <div className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner size={20} /></div>}
      </div>

      {query.trim().length < 3 ? (
        <p className="text-[13px] text-muted">Escribe al menos 3 letras del nombre de usuario de tu amigo.</p>
      ) : results && results.length === 0 && !searching ? (
        <EmptyState icon="search_off" title="Sin resultados">
          No hay nadie cuyo usuario empiece por “{query.trim()}”.
        </EmptyState>
      ) : (
        results && (
          <div className="panel divide-y-[0.5px] divide-white/[0.08] overflow-hidden">
            {results.map((p) => {
              const isFriend = friendIds.has(p.id);
              const isPending = pendingIds.has(p.id) || sent.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3.5 px-4 py-3">
                  <Avatar profile={p} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-white truncate">{p.displayName || p.username}</p>
                    <p className="text-[12.5px] text-muted">@{p.username}</p>
                  </div>
                  {isFriend ? (
                    <span className="text-[12.5px] text-[#5cf08a] font-medium">Amigos</span>
                  ) : isPending ? (
                    <span className="text-[12.5px] text-muted">Solicitud pendiente</span>
                  ) : (
                    <SmallButton tone="primary" disabled={busyId === p.id} onClick={() => send(p)}>
                      {busyId === p.id ? 'Enviando…' : 'Añadir'}
                    </SmallButton>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────
export default function FriendsPage({ onSelectAnime }: FriendsPageProps) {
  const status = useAppStore((s) => s.account.status);
  const requests = useSocialStore((s) => s.requests);
  const friendCount = useSocialStore((s) => s.friends.length);
  const error = useSocialStore((s) => s.error);
  const { getAnimeDetail } = useAniList();
  const toast = useToast();
  const unreadMessages = useChatStore((s) => s.totalUnread);
  const pendingOpen = useChatStore((s) => s.pendingOpen);

  const [tab, setTab] = useState<Tab>('friends');
  const [openFriend, setOpenFriend] = useState<Friend | null>(null);

  const incomingCount = requests.filter((r) => r.direction === 'incoming').length;

  // "Enviar mensaje" desde otra pantalla → abre la pestaña de mensajes
  useEffect(() => {
    if (pendingOpen) {
      setTab('chat');
      setOpenFriend(null);
    }
  }, [pendingOpen]);

  const messageFriend = useCallback((f: Friend) => {
    requestOpenChat(f.profile.id);
  }, []);

  // Al entrar, refrescar (y al volver a estar visible la pestaña de la app)
  useEffect(() => {
    if (status === 'signedIn') void refreshSocial();
  }, [status]);

  const openAnime = useCallback(
    async (mediaId: number) => {
      try {
        onSelectAnime(await getAnimeDetail(mediaId));
      } catch {
        toast.error('No se pudo abrir ese anime ahora mismo.');
      }
    },
    [getAnimeDetail, onSelectAnime, toast]
  );

  if (status === 'loading') {
    return <div className="flex-1 flex items-center justify-center"><Spinner size={32} /></div>;
  }

  if (status === 'unavailable') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState icon="cloud_off" title="Las cuentas no están configuradas">
          Esta versión de KageView no está conectada a ningún servidor de cuentas, así que no hay amigos ni listas en la nube.
        </EmptyState>
      </div>
    );
  }

  if (status === 'signedOut') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center text-center gap-5 max-w-md">
          <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#ff5570] to-[#c81a3f] flex items-center justify-center shadow-moon-lg">
            <span className="material-symbols-outlined filled text-white text-[38px]">group</span>
          </div>
          <h2 className="font-headline text-[26px] font-bold text-white tracking-[-0.03em]">Ver anime con tus amigos</h2>
          <p className="text-[14.5px] text-on-surface-variant leading-relaxed">
            Crea tu cuenta gratis para guardar tu lista, añadir amigos y ver qué están viendo ahora mismo.
          </p>
          <div className="flex gap-3">
            <button onClick={() => openAuth('register')} className="btn-moon h-11 px-7 rounded-full font-semibold text-[14.5px]">Crear cuenta</button>
            <button onClick={() => openAuth('login')} className="btn-glass h-11 px-6 rounded-full font-medium text-[14.5px]">Iniciar sesión</button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; badge?: number; count?: number }> = [
    { id: 'friends', label: 'Amigos', count: friendCount },
    { id: 'chat', label: 'Mensajes', badge: unreadMessages },
    { id: 'requests', label: 'Solicitudes', badge: incomingCount },
    { id: 'add', label: 'Añadir' },
  ];

  return (
    <div className="flex-1 overflow-y-auto -mx-8 px-9 pt-1 pb-16">
      {/* Selector segmentado */}
      <div role="tablist" className="inline-flex p-1 rounded-full bg-white/[0.06] hairline mb-8">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative h-8 px-4 rounded-full text-[13px] font-medium transition-all duration-200 flex items-center gap-1.5 ${
              tab === t.id ? 'bg-white/[0.14] text-white shadow-sm' : 'text-on-surface-variant hover:text-white'
            }`}
          >
            {t.label}
            {t.count ? <span className="text-muted tabular-nums text-[12px]">{t.count}</span> : null}
            {t.badge ? (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10.5px] font-bold flex items-center justify-center shadow-moon">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-error/10 text-error ring-1 ring-error/30 px-4 py-3 text-[13px] flex items-center gap-3">
          <span className="flex-1">{error}</span>
          <button onClick={() => void refreshSocial()} className="font-semibold underline underline-offset-2">Reintentar</button>
        </div>
      )}

      {tab === 'friends' && <FriendsTab onOpenFriend={setOpenFriend} onOpenAnime={openAnime} onMessage={messageFriend} />}
      {tab === 'chat' && <ChatPanel onOpenAnime={openAnime} />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'add' && <AddTab />}

      {openFriend && (
        <FriendProfileModal
          friend={openFriend.profile}
          since={openFriend.since}
          onClose={() => setOpenFriend(null)}
          onSelectAnime={onSelectAnime}
          onMessage={() => messageFriend(openFriend)}
        />
      )}
    </div>
  );
}
