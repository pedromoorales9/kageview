import React, { useState } from 'react';
import { useAppStore } from '../../modules/store';
import { isStaff } from '../../modules/backend';
import RoleBadge from '../components/account/RoleBadge';
import OverviewAdmin from '../components/admin/OverviewAdmin';
import AnnouncementsAdmin from '../components/admin/AnnouncementsAdmin';
import ServicesAdmin from '../components/admin/ServicesAdmin';
import TeamAdmin from '../components/admin/TeamAdmin';

type Tab = 'overview' | 'announcements' | 'services' | 'team';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Resumen', icon: 'space_dashboard' },
  { id: 'announcements', label: 'Anuncios', icon: 'campaign' },
  { id: 'services', label: 'Servicios', icon: 'tune' },
  { id: 'team', label: 'Equipo', icon: 'shield_person' },
];

/**
 * Panel de administración. Solo lo ve el staff (admin/owner); aun así, quien
 * autoriza cada operación es la base de datos (RLS), no esta pantalla.
 */
export default function AdminPage() {
  const profile = useAppStore((s) => s.account.profile);
  const [tab, setTab] = useState<Tab>('overview');

  if (!profile || !isStaff(profile.role)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-16 h-16 rounded-full bg-white/[0.06] hairline flex items-center justify-center">
          <span className="material-symbols-outlined text-[30px] text-muted">lock</span>
        </div>
        <p className="text-[15px] font-semibold text-white">Acceso restringido</p>
        <p className="text-[13.5px] text-on-surface-variant max-w-sm leading-snug">
          Esta sección es solo para el equipo de KageView.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-10">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px] text-primary">admin_panel_settings</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-headline text-[22px] font-bold text-white tracking-[-0.025em] leading-tight">Administración</h1>
            <p className="text-[12.5px] text-muted flex items-center gap-2">
              Sesión como @{profile.username} <RoleBadge role={profile.role} />
            </p>
          </div>
        </div>

        <nav aria-label="Secciones de administración" className="ml-auto inline-flex p-[3px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1)]">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`h-9 px-4 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition-all ${
                  on ? 'bg-white/[0.16] text-white shadow-sm' : 'text-on-surface-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      {tab === 'overview' && <OverviewAdmin onGo={(t) => setTab(t)} />}
      {tab === 'announcements' && <AnnouncementsAdmin />}
      {tab === 'services' && <ServicesAdmin />}
      {tab === 'team' && <TeamAdmin />}
    </div>
  );
}
