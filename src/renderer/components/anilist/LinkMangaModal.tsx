import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  linkMangaTo,
  skipManga,
  syncNow,
  unlinkedRecords,
  useAniListSync,
} from '../../../modules/anilist/sync';
import { searchManga } from '../../../modules/anilist/sync/api';
import { mediaTitle } from '../../../modules/anilist/sync/mapping';
import type { MangaModel } from '../../../modules/manga/types';
import type { ALMedia } from '../../../modules/anilist/sync/types';
import type { SuggestItem } from '../../../modules/anilist/sync/state';
import { MangaRecord, mangaKey, useMangaData } from '../../../modules/manga/mangaStore';
import { safeCoverUrl } from '../../../modules/safeUrl';
import CoverImage from '../ui/CoverImage';
import Spinner from '../ui/Spinner';

interface Props {
  onClose: () => void;
  /** Solo este manga (desde su ficha). Sin esto, la lista de todos los pendientes. */
  only?: MangaModel;
}

const asItem = (m: ALMedia, score = 0): SuggestItem => ({
  id: m.id,
  title: mediaTitle(m),
  cover: safeCoverUrl(m.coverImage.large) ?? safeCoverUrl(m.coverImage.extraLarge),
  score,
});

function Candidate({ item, onPick }: { item: SuggestItem; onPick: () => void }) {
  return (
    <button onClick={onPick} className="flex items-center gap-3 p-2 pr-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.11] text-left transition-colors w-full">
      <CoverImage src={item.cover ?? ''} className="w-9 h-[52px] rounded-md flex-none" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-white leading-snug line-clamp-2">{item.title}</span>
        {item.score > 0 && <span className="block text-[11px] text-muted">{Math.round(item.score * 100)} % de parecido</span>}
      </span>
      <span className="text-[12px] font-semibold text-primary flex-none">Vincular</span>
    </button>
  );
}

function Row({ rec, onDone }: { rec: Pick<MangaRecord, 'manga'>; onDone: () => void }) {
  const key = mangaKey(rec.manga);
  const suggestions = useAniListSync((s) => s.suggestions[key]?.items ?? []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SuggestItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(suggestions.length === 0);

  const run = useCallback(async (term: string) => {
    setSearching(true);
    try {
      const found = await searchManga(term, 8);
      setResults(found.map((m) => asItem(m)));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Búsqueda automática con el título al abrir la fila sin sugerencias guardadas
  useEffect(() => {
    if (suggestions.length === 0) { setQuery(rec.manga.title); void run(rec.manga.title); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const t = setTimeout(() => void run(query), 600);
    return () => clearTimeout(t);
  }, [query, open, run]);

  const pick = (item: SuggestItem) => {
    linkMangaTo(rec.manga, item, 'manual');
    void syncNow();
    onDone();
  };

  const shown = results ?? [];
  return (
    <li className="rounded-2xl bg-white/[0.04] p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <CoverImage src={rec.manga.coverUrl} className="w-10 h-14 rounded-md flex-none" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-white leading-snug line-clamp-2">{rec.manga.title}</p>
          <p className="text-[11px] text-muted">{suggestions.length > 0 ? 'Posibles coincidencias en AniList' : 'Sin sugerencias claras: búscalo por su título original'}</p>
        </div>
        <button onClick={() => { skipManga(rec.manga); onDone(); }} className="text-[12px] text-muted hover:text-white flex-none">No vincular</button>
      </div>

      {suggestions.length > 0 && !open && (
        <div className="flex flex-col gap-1.5">
          {suggestions.slice(0, 3).map((s) => <Candidate key={s.id} item={s} onPick={() => pick(s)} />)}
        </div>
      )}

      {(open || suggestions.length === 0) ? (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-[17px] pointer-events-none">search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en AniList…"
              aria-label="Buscar en AniList"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.07] text-[13px] text-white placeholder:text-muted outline-none focus:bg-white/[0.12]"
            />
            {searching && <span className="absolute right-2.5 top-1/2 -translate-y-1/2"><Spinner size={15} /></span>}
          </div>
          {shown.length > 0
            ? <div className="flex flex-col gap-1.5">{shown.map((s) => <Candidate key={s.id} item={s} onPick={() => pick(s)} />)}</div>
            : !searching && results !== null && <p className="text-[12px] text-muted">Sin resultados.</p>}
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="self-start text-[12px] text-secondary hover:text-white">Ninguna es: buscar otra…</button>
      )}
    </li>
  );
}

export default function LinkMangaModal({ onClose, only }: Props) {
  const records = useMangaData((s) => s.records);
  const links = useAniListSync((s) => s.links);
  const skipped = useAniListSync((s) => s.skipped);
  const suggestions = useAniListSync((s) => s.suggestions);
  const [confirmAll, setConfirmAll] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pending = useMemo(() => (only ? [] : unlinkedRecords()), [only, records, links, skipped]);
  const withSuggestion = pending.filter((r) => (suggestions[mangaKey(r.manga)]?.items.length ?? 0) > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const acceptAll = () => {
    for (const r of withSuggestion) {
      const best = suggestions[mangaKey(r.manga)].items[0];
      linkMangaTo(r.manga, best, 'manual');
    }
    setConfirmAll(false);
    void syncNow();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-[#09050a]/80 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Vincular mangas con AniList" className="relative w-full max-w-2xl max-h-[84vh] flex flex-col rounded-[24px] bg-[#130a11] hairline shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] animate-fade-in-scale overflow-hidden">
        <div className="flex-none px-6 pt-5 pb-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-headline text-[18px] font-bold text-white">{only ? 'Vincular con AniList' : 'Vincular mangas con AniList'}</h2>
            <p className="text-[12.5px] text-on-surface-variant mt-1 leading-snug">
              {only ? `Elige a qué obra de AniList corresponde «${only.title}».` : 'Estos mangas no se pudieron emparejar con seguridad. Elige su ficha para que su progreso se sincronice.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors flex-none">
            <span className="material-symbols-outlined text-[19px]">close</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5">
          {!only && withSuggestion.length > 1 && (
            <div className="mb-3 rounded-xl bg-primary/10 ring-1 ring-primary/20 p-3 flex items-center gap-3 flex-wrap">
              <p className="text-[12.5px] text-on-surface-variant flex-1 min-w-[200px]">
                {confirmAll ? `Se vincularán ${withSuggestion.length} mangas con su mejor sugerencia. Revisa antes: una sugerencia errónea mandaría su progreso a otra obra.` : `${withSuggestion.length} mangas tienen una sugerencia.`}
              </p>
              {confirmAll ? (
                <span className="flex gap-2">
                  <button onClick={acceptAll} className="btn-moon h-8 px-4 rounded-full text-[12.5px] font-semibold">Vincular {withSuggestion.length}</button>
                  <button onClick={() => setConfirmAll(false)} className="btn-glass h-8 px-4 rounded-full text-[12.5px]">Cancelar</button>
                </span>
              ) : (
                <button onClick={() => setConfirmAll(true)} className="btn-glass h-8 px-4 rounded-full text-[12.5px] font-medium">Aceptar la mejor sugerencia de todos</button>
              )}
            </div>
          )}

          {only ? (
            <ul className="flex flex-col gap-2.5"><Row rec={{ manga: only }} onDone={onClose} /></ul>
          ) : pending.length === 0 ? (
            <div className="py-14 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] opacity-50">task_alt</span>
              <p className="text-[14px] mt-2">No hay mangas pendientes de vincular.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {pending.map((r) => <Row key={mangaKey(r.manga)} rec={r} onDone={() => undefined} />)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

