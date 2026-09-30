import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../../modules/store';
import { PublicProfile, StaffMember, getBackend } from '../../../modules/backend';
import { errorMessage } from '../../../modules/account';
import { useToast } from '../ui/Toast';
import Spinner from '../ui/Spinner';
import Avatar from '../account/Avatar';
import RoleBadge from '../account/RoleBadge';
import { Notice, inputClass } from '../account/formKit';
import { SectionLabel, SmallButton } from './adminKit';

export default function TeamAdmin() {
  const toast = useToast();
  const me = useAppStore((s) => s.account.profile);
  const isOwner = me?.role === 'owner';

  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    try {
      setStaff(await getBackend()!.adminListStaff());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Búsqueda (mínimo 3 letras, con pequeña espera)
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 3) { setResults(null); setSearching(false); return; }
    const id = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await getBackend()!.searchUsers(q);
        if (id === seq.current) setResults(r);
      } catch {
        if (id === seq.current) setResults([]);
      } finally {
        if (id === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const setRole = async (p: PublicProfile, role: 'user' | 'admin') => {
    setBusyId(p.id);
    try {
      await getBackend()!.adminSetRole(p.id, role);
      toast.success(
        role === 'admin' ? `@${p.username} ahora es administrador.` : `@${p.username} ya no es administrador.`,
        'Equipo'
      );
      setConfirmRemove(null);
      await load();
    } catch (e) {
      toast.error(errorMessage(e), 'Equipo');
    } finally {
      setBusyId(null);
    }
  };

  const staffIds = new Set((staff ?? []).map((m) => m.profile.id));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <section className="panel p-6 flex flex-col gap-4">
        <SectionLabel>Equipo</SectionLabel>
        {error ? (
          <Notice kind="error">{error}</Notice>
        ) : staff === null ? (
          <div className="flex justify-center py-8"><Spinner size={24} /></div>
        ) : (
          <ul className="flex flex-col divide-y-[0.5px] divide-white/[0.08]">
            {staff.map((m) => (
              <li key={m.profile.id} className="py-3 flex items-center gap-3">
                <Avatar profile={m.profile} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] text-white font-medium truncate">{m.profile.displayName || m.profile.username}</p>
                    <RoleBadge role={m.role} />
                  </div>
                  <p className="text-[12.5px] text-muted truncate">@{m.profile.username}</p>
                </div>
                {isOwner && m.role === 'admin' && (
                  confirmRemove === m.profile.id ? (
                    <div className="flex gap-2">
                      <SmallButton onClick={() => setConfirmRemove(null)}>No</SmallButton>
                      <SmallButton tone="danger" disabled={busyId === m.profile.id} onClick={() => void setRole(m.profile, 'user')}>
                        Quitar
                      </SmallButton>
                    </div>
                  ) : (
                    <SmallButton tone="danger" onClick={() => setConfirmRemove(m.profile.id)}>Quitar admin</SmallButton>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12.5px] text-muted leading-snug">
          Los administradores pueden publicar anuncios y desactivar servicios. Solo el owner puede nombrar o quitar administradores.
        </p>
      </section>

      <section className="panel p-6 flex flex-col gap-4">
        <SectionLabel>Nombrar administrador</SectionLabel>
        {isOwner ? (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.toLowerCase())}
              placeholder="Busca por nombre de usuario (mín. 3 letras)"
              aria-label="Buscar usuario"
              className={inputClass}
              spellCheck={false}
            />
            {searching && <div className="flex justify-center py-3"><Spinner size={20} /></div>}
            {!searching && results && results.length === 0 && (
              <p className="text-[13.5px] text-muted">Nadie con ese nombre.</p>
            )}
            {results && results.length > 0 && (
              <ul className="flex flex-col divide-y-[0.5px] divide-white/[0.08]">
                {results.map((p) => (
                  <li key={p.id} className="py-3 flex items-center gap-3">
                    <Avatar profile={p} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-white font-medium truncate">{p.displayName || p.username}</p>
                      <p className="text-[12.5px] text-muted truncate">@{p.username}</p>
                    </div>
                    {staffIds.has(p.id) ? (
                      <span className="text-[12.5px] text-muted">Ya es del equipo</span>
                    ) : (
                      <SmallButton tone="primary" disabled={busyId === p.id} onClick={() => void setRole(p, 'admin')}>
                        Hacer admin
                      </SmallButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-[13.5px] text-on-surface-variant leading-snug">
            Solo el owner puede gestionar el equipo.
          </p>
        )}
      </section>
    </div>
  );
}
