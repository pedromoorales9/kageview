import React, { useCallback, useEffect, useState } from 'react';
import { AuditEntry, getBackend } from '../../../modules/backend';
import { errorMessage } from '../../../modules/account';
import { timeAgo } from '../../../modules/social';
import Spinner from '../ui/Spinner';
import { Notice } from '../account/formKit';
import { AUDIT_GROUPS, AuditGroup, describeAudit, formatWhen } from './format';
import { SectionLabel, SmallButton } from './adminKit';

const PAGE = 30;

/** Una línea del registro ("kage publicó el anuncio «X» · hace 5 min"). */
export function AuditRow({ e, compact = false }: { e: AuditEntry; compact?: boolean }) {
  const v = describeAudit(e);
  return (
    <li className={`flex items-start gap-3 ${compact ? 'py-2' : 'py-3'}`}>
      <span className={`material-symbols-outlined text-[19px] mt-[1px] flex-none ${v.tone}`} aria-hidden>{v.icon}</span>
      <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-on-surface-variant break-words">
        <strong className="text-white font-semibold">{e.actor}</strong> {v.text}
      </p>
      <time className="flex-none text-[12px] text-muted whitespace-nowrap" dateTime={e.createdAt} title={formatWhen(e.createdAt)}>
        {timeAgo(e.createdAt)}
      </time>
    </li>
  );
}

export default function AuditAdmin() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<AuditGroup | 'all'>('all');

  const load = useCallback(async (before?: number) => {
    setBusy(true);
    try {
      const page = await getBackend()!.adminAuditLog({ before, limit: PAGE });
      setEntries((prev) => (before === undefined ? page : [...(prev ?? []), ...page]));
      setMore(page.length === PAGE);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = (entries ?? []).filter((e) => group === 'all' || describeAudit(e).group === group);

  return (
    <section className="panel p-6 flex flex-col gap-4 max-w-[860px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Registro de actividad del equipo</SectionLabel>
        <SmallButton onClick={() => void load()}>
          <span className="material-symbols-outlined text-[15px]">refresh</span>Actualizar
        </SmallButton>
      </div>
      <p className="text-[13px] text-on-surface-variant leading-snug">
        Todo lo que hace el equipo queda anotado aquí y no se puede editar ni borrar. Los cambios hechos directamente desde
        Supabase aparecen como «sistema».
      </p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar registro">
        {AUDIT_GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={`h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-colors ${
              group === g.id ? 'bg-white/[0.16] text-white' : 'bg-white/[0.06] text-on-surface-variant hover:text-white'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {error ? (
        <Notice kind="error">{error}</Notice>
      ) : entries === null ? (
        <div className="flex justify-center py-10"><Spinner size={24} /></div>
      ) : shown.length === 0 ? (
        <p className="text-[13.5px] text-muted py-6 text-center">Nada que mostrar todavía.</p>
      ) : (
        <ul className="flex flex-col divide-y-[0.5px] divide-white/[0.08]">
          {shown.map((e) => <AuditRow key={e.id} e={e} />)}
        </ul>
      )}

      {more && !error && (
        <div className="flex justify-center">
          <SmallButton disabled={busy} onClick={() => void load(entries?.[entries.length - 1]?.id)}>
            {busy ? 'Cargando…' : 'Cargar más'}
          </SmallButton>
        </div>
      )}
    </section>
  );
}
