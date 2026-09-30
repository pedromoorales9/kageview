import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminUser, getBackend } from '../../../modules/backend';
import { errorMessage } from '../../../modules/account';
import { timeAgo } from '../../../modules/social';
import { useAppStore } from '../../../modules/store';
import { useToast } from '../ui/Toast';
import Spinner from '../ui/Spinner';
import Avatar from '../account/Avatar';
import RoleBadge from '../account/RoleBadge';
import { Notice, inputClass } from '../account/formKit';
import { formatDay } from './format';
import { SectionLabel, SmallButton } from './adminKit';

const PAGE = 20;

export default function UsersAdmin() {
  const toast = useToast();
  const me = useAppStore((s) => s.account.profile);
  const isOwner = me?.role === 'owner';

  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (q: string, offset = 0) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const page = await getBackend()!.adminListUsers({ query: q, limit: PAGE, offset });
      if (id !== seq.current) return;
      setUsers((prev) => (offset === 0 ? page.users : [...(prev ?? []), ...page.users]));
      setTotal(page.total);
      setError(null);
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  // Búsqueda con pequeña espera (y carga inicial)
  useEffect(() => {
    const t = setTimeout(() => void load(query.trim()), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  const patch = (id: string, change: Partial<AdminUser>) =>
    setUsers((prev) => prev?.map((u) => (u.profile.id === id ? { ...u, ...change } : u)) ?? prev);

  const act = async (u: AdminUser, fn: () => Promise<void>, ok: string, change: Partial<AdminUser>) => {
    setBusyId(u.profile.id);
    try {
      await fn();
      patch(u.profile.id, change);
      toast.success(ok, 'Usuarios');
      setSuspending(null);
      setReason('');
    } catch (e) {
      toast.error(errorMessage(e), 'Usuarios');
    } finally {
      setBusyId(null);
    }
  };

  const backend = () => getBackend()!;

  return (
    <section className="panel p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Usuarios</SectionLabel>
        {users && <span className="text-[12.5px] text-muted tabular-nums">{total} {total === 1 ? 'usuario' : 'usuarios'}</span>}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o usuario…"
        aria-label="Buscar usuarios"
        className={inputClass}
        spellCheck={false}
        maxLength={40}
      />

      {error ? (
        <Notice kind="error">{error}</Notice>
      ) : users === null ? (
        <div className="flex justify-center py-10"><Spinner size={24} /></div>
      ) : users.length === 0 ? (
        <p className="text-[13.5px] text-muted py-6 text-center">Nadie coincide con esa búsqueda.</p>
      ) : (
        <ul className="flex flex-col divide-y-[0.5px] divide-white/[0.08]">
          {users.map((u) => {
            const p = u.profile;
            const isMe = p.id === me?.id;
            const canModerate = u.role === 'user' && !isMe;
            const open = suspending === p.id;
            return (
              <li key={p.id} className="py-3.5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar profile={p} size={42} className={u.suspended ? 'grayscale opacity-60' : ''} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14.5px] text-white font-medium truncate max-w-[260px]">{p.displayName || p.username}</p>
                      <RoleBadge role={u.role} />
                      {u.suspended && (
                        <span className="inline-flex items-center gap-1 h-[20px] px-2 rounded-full text-[10.5px] font-bold uppercase tracking-[0.08em] bg-error/15 text-error">
                          <span className="material-symbols-outlined text-[13px]" aria-hidden>block</span>Suspendida
                        </span>
                      )}
                      {isMe && <span className="text-[11px] text-muted">(tú)</span>}
                    </div>
                    <p className="text-[12.5px] text-muted truncate">
                      @{p.username} · se unió {formatDay(u.createdAt)}
                      {u.lastActive ? ` · última actividad ${timeAgo(u.lastActive)}` : ''}
                    </p>
                    {u.suspended && u.suspendedReason && (
                      <p className="text-[12.5px] text-error/90 mt-0.5 break-words">Motivo: {u.suspendedReason}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end flex-none">
                    {isOwner && u.role !== 'owner' && !isMe && (
                      u.role === 'admin' ? (
                        <SmallButton
                          disabled={busyId === p.id}
                          onClick={() => void act(u, () => backend().adminSetRole(p.id, 'user'), `@${p.username} ya no es administrador.`, { role: 'user' })}
                        >
                          Quitar admin
                        </SmallButton>
                      ) : !u.suspended ? (
                        <SmallButton
                          disabled={busyId === p.id}
                          onClick={() => void act(u, () => backend().adminSetRole(p.id, 'admin'), `@${p.username} ahora es administrador.`, { role: 'admin' })}
                        >
                          Hacer admin
                        </SmallButton>
                      ) : null
                    )}
                    {canModerate && (u.suspended ? (
                      <SmallButton
                        tone="primary"
                        disabled={busyId === p.id}
                        onClick={() => void act(u, () => backend().adminSetSuspended(p.id, false), `@${p.username} reactivada.`, { suspended: false, suspendedReason: null })}
                      >
                        Reactivar
                      </SmallButton>
                    ) : (
                      <SmallButton tone="danger" onClick={() => { setSuspending(open ? null : p.id); setReason(''); }}>
                        {open ? 'Cancelar' : 'Suspender'}
                      </SmallButton>
                    ))}
                  </div>
                </div>

                {open && (
                  <div className="flex flex-col sm:flex-row gap-2 pl-[54px]">
                    <input
                      autoFocus
                      value={reason}
                      maxLength={200}
                      onChange={(e) => setReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void act(u, () => backend().adminSetSuspended(p.id, true, reason), `@${p.username} suspendida.`, { suspended: true, suspendedReason: reason.trim() || null });
                      }}
                      placeholder="Motivo (opcional, solo lo ve el equipo)"
                      aria-label={`Motivo de la suspensión de ${p.username}`}
                      className={`${inputClass} !h-9 !text-[13.5px] flex-1`}
                    />
                    <SmallButton
                      tone="danger"
                      disabled={busyId === p.id}
                      onClick={() => void act(u, () => backend().adminSetSuspended(p.id, true, reason), `@${p.username} suspendida.`, { suspended: true, suspendedReason: reason.trim() || null })}
                    >
                      Confirmar suspensión
                    </SmallButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {users && users.length < total && !error && (
        <div className="flex justify-center">
          <SmallButton disabled={loading} onClick={() => void load(query.trim(), users.length)}>
            {loading ? 'Cargando…' : `Cargar más (${total - users.length})`}
          </SmallButton>
        </div>
      )}

      <p className="text-[12px] text-muted leading-snug">
        Suspender a alguien le impide enviar mensajes y solicitudes, publicar «viendo ahora» y editar su perfil; conserva su
        cuenta y sus datos. No se puede suspender a un administrador ni al owner. Los correos no se muestran.
      </p>
    </section>
  );
}
