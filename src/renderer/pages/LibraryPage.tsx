import React, { useEffect, useState } from 'react';
import { AniListAnime } from '../../types/types';
import useAniList from '../hooks/useAniList';
import { useAppStore } from '../../modules/store';
import { clientData } from '../../modules/clientData';
import AnimeCard from '../components/anime/AnimeCard';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';

interface LibraryPageProps {
  onSelectAnime: (anime: AniListAnime) => void;
}

const STATUS_TABS = [
  { id: 'ALL', label: 'Todos' },
  { id: 'CURRENT', label: 'Viendo' },
  { id: 'COMPLETED', label: 'Completados' },
  { id: 'PLANNING', label: 'Por Ver' },
  { id: 'PAUSED', label: 'Pausados' },
  { id: 'DROPPED', label: 'Abandonados' },
];

const STATUS_BADGE_VARIANT: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  CURRENT: 'primary',
  COMPLETED: 'success',
  PAUSED: 'warning',
  PLANNING: 'neutral',
  DROPPED: 'error',
  REPEATING: 'secondary' as 'primary', // fallback
};

export default function LibraryPage({ onSelectAnime }: LibraryPageProps) {
  const token = useAppStore((s) => s.token);
  const { getUserList, login } = useAniList();
  const [animeList, setAnimeList] = useState<AniListAnime[]>([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const status = activeTab === 'ALL' ? undefined : activeTab;
        const list = await getUserList(status);
        if (!cancelled) setAnimeList(list);
      } catch (err) {
        console.error('[LibraryPage] Error loading list:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token, activeTab, getUserList]);

  // Si no hay token, mostrar pantalla de conexión
  if (!token) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
        <div className="
          w-20 h-20 rounded-2xl gradient-primary
          flex items-center justify-center
        ">
          <span className="material-symbols-outlined filled text-on-primary text-4xl">
            auto_stories
          </span>
        </div>
        <h2 className="font-headline text-2xl font-bold text-on-surface">
          Conecta tu AniList
        </h2>
        <p className="text-sm text-on-surface-variant text-center max-w-md">
          Vincula tu cuenta de AniList para registrar tu progreso, administrar tu lista de seguimiento y sincronizar en todos tus dispositivos.
        </p>
        <button
          id="connect-anilist"
          onClick={() => {
            if (!clientData.clientId || clientData.clientId === 0) {
              alert('Debes configurar tu Client ID en src/modules/clientData.ts para usar esta función.\\nLee las instrucciones en el archivo clientData.ts.');
              return;
            }
            const url = `https://anilist.co/api/v2/oauth/authorize?client_id=${clientData.clientId}&redirect_uri=${clientData.redirectUri}&response_type=code`;
            if (window.electron) {
              window.electron.openExternal(url);
            }
          }}
          className="
            flex items-center gap-2 px-8 py-3
            gradient-primary rounded-full
            text-on-primary font-headline font-semibold text-sm
            transition-all duration-200
            hover:shadow-[0_0_22px_rgba(203,151,255,0.35)]
            hover:scale-[1.02]
          "
        >
          <span className="material-symbols-outlined text-lg">link</span>
          Conectar con AniList
        </button>

        {/* Fallback manual code entry */}
        <div className="flex items-center gap-2 mt-4">
          <input
            type="text"
            placeholder="Pega el código de autorización aquí"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="
              px-4 py-2 rounded-lg
              bg-surface-container-low text-on-surface text-sm
              border border-transparent focus:border-primary/30
              outline-none w-64
              placeholder:text-on-surface-variant/50
            "
          />
          <button
            onClick={async () => {
              if (manualCode.trim()) {
                try {
                  await login(manualCode.trim());
                } catch {
                  console.error('Login failed');
                }
              }
            }}
            className="
              px-4 py-2 rounded-lg
              bg-surface-variant/40 text-on-surface text-sm font-medium
              hover:bg-surface-variant/60 transition-colors
            "
          >
            Enviar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8">
      {/* Status Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2 rounded-full text-xs font-headline font-semibold
              transition-all duration-200
              ${
                activeTab === tab.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={32} />
        </div>
      ) : animeList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant gap-3">
          <span className="material-symbols-outlined text-4xl opacity-40">inbox</span>
          <p className="text-sm">No hay animes en esta categoría</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4">
          {animeList.map((anime: AniListAnime) => (
            <div key={anime.id} className="relative">
              <AnimeCard
                anime={anime}
                onClick={() => onSelectAnime(anime)}
                showProgress={!!anime.mediaListEntry}
                progress={anime.mediaListEntry?.progress || 0}
                mediaListStatus={anime.mediaListEntry?.status}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
