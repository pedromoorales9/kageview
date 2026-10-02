import React, { useState } from 'react';
import { unlinkManga, useAniListSync } from '../../../modules/anilist/sync';
import { mangaKey } from '../../../modules/manga/mangaStore';
import type { MangaModel } from '../../../modules/manga/types';
import LinkMangaModal from './LinkMangaModal';

/** Estado del vínculo de un manga con AniList, en su ficha (solo si AniList está conectada). */
export default function AniListLinkButton({ manga }: { manga: MangaModel }) {
  const connected = useAniListSync((s) => !!s.status?.connected);
  const link = useAniListSync((s) => s.links[mangaKey(manga)]);
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);

  if (!connected) return null;

  if (manga.sourceId === 'anilist') {
    return (
      <span title="Esta ficha viene de tu lista de AniList" className="h-11 px-4 rounded-full bg-[#3db4f2]/15 text-[#3db4f2] text-[13px] font-medium flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">cloud_done</span>
        De tu AniList
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => (link ? setMenu((m) => !m) : setModal(true))}
        title={link ? `Vinculado con «${link.title}» en AniList` : 'Elige qué obra de AniList es esta para sincronizar tu progreso'}
        className={`h-11 px-4 rounded-full text-[13.5px] font-medium flex items-center gap-2 transition-colors max-w-[260px] ${
          link ? 'bg-[#3db4f2]/15 text-[#3db4f2] hover:bg-[#3db4f2]/25' : 'bg-white/[0.08] text-white hover:bg-white/[0.15]'
        }`}
      >
        <span className="material-symbols-outlined text-[18px] flex-none">{link ? 'link' : 'add_link'}</span>
        <span className="truncate">{link ? `AniList · ${link.title}` : 'Vincular con AniList'}</span>
      </button>
      {menu && link && (
        <div role="menu" className="absolute left-0 top-12 z-20 w-52 rounded-2xl bg-[#1d1119] ring-1 ring-white/10 shadow-2xl p-1.5">
          <button role="menuitem" onClick={() => { setMenu(false); setModal(true); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-white text-left hover:bg-white/[0.08]">
            <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
            Cambiar vínculo
          </button>
          <button role="menuitem" onClick={() => { setMenu(false); unlinkManga(manga); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-error text-left hover:bg-error/10">
            <span className="material-symbols-outlined text-[18px]">link_off</span>
            Desvincular
          </button>
        </div>
      )}
      {modal && <LinkMangaModal only={manga} onClose={() => setModal(false)} />}
    </div>
  );
}
