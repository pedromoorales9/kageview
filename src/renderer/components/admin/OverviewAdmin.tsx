import React, { useCallback, useEffect, useState } from 'react';
import { AdminStats, AuditEntry, getBackend } from '../../../modules/backend';
import { errorMessage } from '../../../modules/account';
import { useAppStore } from '../../../modules/store';
import Spinner from '../ui/Spinner';
import { Notice } from '../account/formKit';
import { AuditRow } from './AuditAdmin';
import SignupsChart from './SignupsChart';
import { SectionLabel, SmallButton, StatCard } from './adminKit';
import { serviceLabel } from './services';
import type { AdminTab } from '../../pages/AdminPage';

export default function OverviewAdmin({ onGo }: { onGo: (tab: AdminTab) => void }) {
  const disabled = useAppStore((s) => s.remoteConfig?.providersDisabled) ?? {};
  const disabledIds = Object.keys(disabled);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recent, setRecent] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const b = getBackend()!;
      const [s, r] = await Promise.all([b.adminStats(), b.adminAuditLog({ limit: 6 })]);
      setStats(s);
      setRecent(r);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!stats) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="flex flex-col gap-6">
      {disabledIds.length > 0 && (
        <div role="status" className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-error/10 ring-1 ring-error/30">
          <span className="material-symbols-outlined text-[21px] text-error flex-none" aria-hidden>power_off</span>
          <p className="flex-1 text-[13.5px] text-on-surface-variant leading-snug">
            <strong className="text-white">{disabledIds.map(serviceLabel).join(', ')}</strong>{' '}
            {disabledIds.length === 1 ? 'está desactivado' : 'están desactivados'} para todos los usuarios.
          </p>
          <SmallButton onClick={() => onGo('services')}>Gestionar</SmallButton>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon="group" label="Usuarios" value={stats.usersTotal} hint={`+${stats.usersLast7Days} en los últimos 7 días`} />
        <StatCard icon="play_circle" label="Viendo ahora" value={stats.watchingNow} hint="Con «viendo ahora» activo (15 min)" />
        <StatCard icon="campaign" label="Anuncios en directo" value={stats.announcementsLive} />
        <StatCard
          icon="power_off"
          label="Servicios apagados"
          value={disabledIds.length}
          hint={disabledIds.length ? 'Desactivados para todos' : 'Todo operativo'}
        />
      </div>

      <SignupsChart />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <section className="panel p-6 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Actividad reciente</SectionLabel>
            <SmallButton onClick={() => onGo('audit')}>Ver todo</SmallButton>
          </div>
          {recent && recent.length > 0 ? (
            <ul className="flex flex-col divide-y-[0.5px] divide-white/[0.08]">
              {recent.map((e) => <AuditRow key={e.id} e={e} compact />)}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted py-4">Todavía no hay actividad.</p>
          )}
        </section>

        <section className="panel p-6 flex flex-col gap-3">
          <SectionLabel>Accesos rápidos</SectionLabel>
          <SmallButton tone="primary" onClick={() => onGo('announcements')}>
            <span className="material-symbols-outlined text-[16px]">campaign</span>Nuevo anuncio
          </SmallButton>
          <SmallButton onClick={() => onGo('services')}>
            <span className="material-symbols-outlined text-[16px]">tune</span>Gestionar servicios
          </SmallButton>
          <SmallButton onClick={() => onGo('users')}>
            <span className="material-symbols-outlined text-[16px]">group</span>Buscar un usuario
          </SmallButton>
          <SmallButton onClick={() => void load()}>
            <span className="material-symbols-outlined text-[16px]">refresh</span>Actualizar cifras
          </SmallButton>
          <p className="text-[12px] text-muted leading-snug mt-1">
            Las cifras son agregadas: aquí no se ve el contenido de listas ni mensajes de nadie.
          </p>
        </section>
      </div>
    </div>
  );
}
