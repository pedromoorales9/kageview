import React, { useState } from 'react';
import { useAppStore } from '../../modules/store';
import { isStaff } from '../../modules/backend';
import RoleBadge from '../components/account/RoleBadge';
import OverviewAdmin from '../components/admin/OverviewAdmin';
import AnnouncementsAdmin from '../components/admin/AnnouncementsAdmin';
import ServicesAdmin from '../components/admin/ServicesAdmin';
import UsersAdmin from '../components/admin/UsersAdmin';
import TeamAdmin from '../components/admin/TeamAdmin';
import AuditAdmin from '../components/admin/AuditAdmin';

export type AdminTab = 'overview' | 'announcements' | 'services' | 'users' | 'team' | 'audit';

const TABS: Array<{ id: AdminTab; label: string; icon: string; hint: string }> = [
  { id: 'overview', label: 'Resumen', icon: 'space_dashboard', hint: 'Cifras y actividad' },
  { id: 'announcements', label: 'Anuncios', icon: 'campaign', hint: 'Avisos para todos' },
  { id: 'services', label: 'Servicios', icon: 'tune', hint: 'Apagar páginas caídas' },
  { id: 'users', label: 'Usuarios', icon: 'group', hint: 'Buscar y moderar' },
  { id: 'team', label: 'Equipo', icon: 'shield_person', hint: 'Administradores' },
  { id: 'audit', label: 'Registro', icon: 'history', hint: 'Qué ha hecho el equipo' },
];

/**
 * Panel de administración. Solo lo ve el staff (admin/owner); aun así, quien
 * autoriza cada operación es la base de datos (RLS), no esta pantalla.
 */
export default function AdminPage() {
  const profile = useAppStore((s) => s.account.profile);
  const liveAnnouncements = useAppStore((s) => s.remoteConfig?.announcements.length ?? 0);
  const disabledServices = useAppStore((s) => Object.keys(s.remoteConfig?.providersDisabled ?? {}).length);
  const [tab, setTab] = useState<AdminTab>('overview');

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

  const badge = (id: AdminTab): { n: number; tone: string } | null => {
    if (id === 'announcements' && liveAnnouncements) return { n: liveAnnouncements, tone: 'bg-emerald-400/20 text-emerald-300' };
    if (id === 'services' && disabledServices) return { n: disabledServices, tone: 'bg-error/20 text-error' };
    return null;
  };

  return (
    <div className="flex-1 min-h-0 flex gap-6 pb-6">
      {/* ── Menú lateral ─────────────────────────────── */}
      <aside className="w-[214px] flex-none flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-3 px-1">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center flex-none">
            <span className="material-symbols-outlined text-[24px] text-primary">admin_panel_settings</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-headline text-[17px] font-bold text-white tracking-[-0.02em] leading-tight">Administración</h1>
            <div className="mt-1"><RoleBadge role={profile.role} /></div>
          </div>
        </div>

        <nav aria-label="Secciones de administración" className="flex flex-col gap-1">
          {TABS.map((t) => {
            const on = tab === t.id;
            const b = badge(t.id);
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  on ? 'bg-white/[0.12] text-white' : 'text-on-surface-variant hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] flex-none ${on ? 'text-primary' : ''}`}>{t.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium leading-tight">{t.label}</span>
                  <span className="block text-[11.5px] text-muted leading-tight truncate">{t.hint}</span>
                </span>
                {b && (
                  <span className={`flex-none min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center tabular-nums ${b.tone}`}>
                    {b.n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <p className="px-1 text-[11.5px] text-muted leading-snug mt-auto">
          Sesión como <strong className="text-on-surface-variant">@{profile.username}</strong>. Cada acción queda anotada en el registro.
        </p>
      </aside>

      {/* ── Contenido ────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto pr-2 pb-4">
        {tab === 'overview' && <OverviewAdmin onGo={setTab} />}
        {tab === 'announcements' && <AnnouncementsAdmin />}
        {tab === 'services' && <ServicesAdmin />}
        {tab === 'users' && <UsersAdmin />}
        {tab === 'team' && <TeamAdmin />}
        {tab === 'audit' && <AuditAdmin />}
      </div>
    </div>
  );
}
