import React, { useCallback, useEffect, useState } from 'react';
import { AdminStats, getBackend } from '../../../modules/backend';
import { errorMessage } from '../../../modules/account';
import { useAppStore } from '../../../modules/store';
import Spinner from '../ui/Spinner';
import { Notice } from '../account/formKit';
import { SmallButton, StatCard } from './adminKit';

export default function OverviewAdmin({ onGo }: { onGo: (tab: 'announcements' | 'services') => void }) {
  const disabledCount = useAppStore((s) => Object.keys(s.remoteConfig?.providersDisabled ?? {}).length);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await getBackend()!.adminStats());
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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon="group" label="Usuarios" value={stats.usersTotal} hint={`+${stats.usersLast7Days} en los últimos 7 días`} />
        <StatCard icon="play_circle" label="Viendo ahora" value={stats.watchingNow} hint="Con «viendo ahora» activo (15 min)" />
        <StatCard icon="campaign" label="Anuncios en directo" value={stats.announcementsLive} />
        <StatCard
          icon="power_off"
          label="Servicios apagados"
          value={disabledCount}
          hint={disabledCount ? 'Desactivados para todos' : 'Todo operativo'}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <SmallButton tone="primary" onClick={() => onGo('announcements')}>
          <span className="material-symbols-outlined text-[16px]">campaign</span>Nuevo anuncio
        </SmallButton>
        <SmallButton onClick={() => onGo('services')}>
          <span className="material-symbols-outlined text-[16px]">tune</span>Gestionar servicios
        </SmallButton>
        <SmallButton onClick={() => void load()}>
          <span className="material-symbols-outlined text-[16px]">refresh</span>Actualizar cifras
        </SmallButton>
      </div>
      <p className="text-[12.5px] text-muted leading-snug max-w-[620px]">
        Las cifras son agregadas: aquí no se ve el contenido de listas ni mensajes de nadie.
      </p>
    </div>
  );
}
