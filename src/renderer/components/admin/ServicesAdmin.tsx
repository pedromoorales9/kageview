import React, { useState } from 'react';
import { useAppStore } from '../../../modules/store';
import { getBackend } from '../../../modules/backend';
import { errorMessage } from '../../../modules/account';
import { refreshRemoteConfig } from '../../../modules/remoteConfig';
import { useToast } from '../ui/Toast';
import { Switch, inputClass } from '../account/formKit';
import { SectionLabel } from './adminKit';

/** Servicios que se pueden desactivar para todos los usuarios. */
const SERVICES: Array<{ id: string; label: string; kind: 'Anime' | 'Manga' }> = [
  { id: 'animeflv', label: 'AnimeFLV', kind: 'Anime' },
  { id: 'animeav1', label: 'AnimeAV1', kind: 'Anime' },
  { id: 'jkanime', label: 'JKAnime', kind: 'Anime' },
  { id: 'mangadex', label: 'MangaDex', kind: 'Manga' },
  { id: 'inmanga', label: 'InManga', kind: 'Manga' },
  { id: 'manhwaweb', label: 'ManhwaWeb', kind: 'Manga' },
  { id: 'mangaoni', label: 'MangaOni', kind: 'Manga' },
];

const DEFAULT_REASON = 'Desactivado temporalmente por mantenimiento.';

export default function ServicesAdmin() {
  const toast = useToast();
  const disabled = useAppStore((s) => s.remoteConfig?.providersDisabled) ?? {};
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const apply = async (id: string, reason: string | null, okMsg: string) => {
    setBusy(id);
    try {
      await getBackend()!.adminSetProviderSwitch(id, reason);
      await refreshRemoteConfig();
      setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
      toast.success(okMsg, 'Servicios');
    } catch (e) {
      toast.error(errorMessage(e), 'Servicios');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel p-6 flex flex-col gap-5 max-w-[760px]">
      <div className="flex flex-col gap-1.5">
        <SectionLabel>Servicios</SectionLabel>
        <p className="text-[13.5px] text-on-surface-variant leading-snug">
          Si una página de anime o manga se cae, apágala aquí: desaparece del selector de todos los usuarios y
          verán el motivo. Se aplica en unos minutos (la app consulta cada 5 min).
        </p>
      </div>

      <ul className="flex flex-col divide-y-[0.5px] divide-white/[0.08]">
        {SERVICES.map((s) => {
          const off = disabled[s.id] !== undefined;
          const draft = drafts[s.id] ?? disabled[s.id] ?? '';
          return (
            <li key={s.id} className="py-3.5 flex flex-col gap-2.5">
              <div className="flex items-center gap-4">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-none ${off ? 'bg-error shadow-[0_0_8px_rgba(255,92,120,0.7)]' : 'bg-emerald-400'}`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] text-white font-medium">
                    {s.label} <span className="ml-1.5 text-[11px] uppercase tracking-wide text-muted">{s.kind}</span>
                  </p>
                  <p className="text-[12.5px] text-muted">{off ? 'Desactivado para todos' : 'Operativo'}</p>
                </div>
                <Switch
                  checked={!off}
                  disabled={busy === s.id}
                  label={`${s.label} operativo`}
                  onChange={(on) =>
                    void (on
                      ? apply(s.id, null, `${s.label} vuelve a estar activo.`)
                      : apply(s.id, DEFAULT_REASON, `${s.label} desactivado para todos.`))
                  }
                />
              </div>
              {off && (
                <div className="flex gap-2 pl-[26px]">
                  <input
                    aria-label={`Motivo para ${s.label}`}
                    value={draft}
                    maxLength={200}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onBlur={() => {
                      const v = (drafts[s.id] ?? disabled[s.id] ?? '').trim();
                      if (v && v !== disabled[s.id]) void apply(s.id, v, 'Motivo actualizado.');
                    }}
                    placeholder="Motivo que verán los usuarios"
                    className={`${inputClass} !h-9 !text-[13.5px]`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
