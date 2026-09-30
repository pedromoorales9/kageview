import React, { useMemo, useRef, useState } from 'react';
import { MangaRecord, clearReading, historyRecords, mangaKey, useMangaData } from '../../../modules/manga/mangaStore';
import Spinner from '../ui/Spinner';

interface ContinueReadingRowProps {
  /** Abre el lector en el capítulo y la página guardados. */
  onContinue: (record: MangaRecord) => Promise<void>;
  title?: string;
  limit?: number;
}

function ContinueCard({ record, onOpen, busy }: { record: MangaRecord; onOpen: () => void; busy: boolean }) {
  const [imgError, setImgError] = useState(false);
  const last = record.last!;
  const pct = last.pageCount > 0 ? Math.min(100, Math.round(((last.page + 1) / last.pageCount) * 100)) : 0;
  const chapter = last.chapterNumber ? `Cap. ${last.chapterNumber}` : 'Capítulo';
  const where = last.pageCount > 0 ? `${chapter} · pág. ${last.page + 1}/${last.pageCount}` : chapter;

  return (
    <div className="relative group flex-none w-[168px] snap-start">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="w-full text-left flex flex-col gap-2 transition-transform duration-300 ease-mac hover:-translate-y-1 active:scale-[0.985] disabled:opacity-70"
      >
        <div className="relative aspect-[3/4] rounded-[14px] overflow-hidden bg-surface-container shadow-card ring-[0.5px] ring-white/10">
          {record.manga.coverUrl && !imgError ? (
            <img
              src={record.manga.coverUrl}
              alt={record.manga.title}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition-transform duration-[700ms] ease-mac group-hover:scale-[1.06]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="material-symbols-outlined text-muted text-4xl">menu_book</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#09050a] via-[#09050a]/50 to-transparent pointer-events-none" />

          <div className="absolute inset-x-2 bottom-2">
            <p className="text-[11.5px] font-semibold text-white drop-shadow">{where}</p>
            {pct > 0 && (
              <div className="mt-1.5 h-[3px] rounded-full bg-white/20 overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>

          <div className="absolute inset-0 flex items-center justify-center bg-[#09050a]/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-11 h-11 rounded-full glass flex items-center justify-center text-white">
              {busy ? <Spinner size={20} /> : <span className="material-symbols-outlined filled text-[24px]">play_arrow</span>}
            </div>
          </div>
        </div>
        <h4 className="text-[13px] font-semibold text-white leading-snug line-clamp-2 px-0.5 group-hover:text-secondary transition-colors">
          {record.manga.title}
        </h4>
      </button>

      <button
        type="button"
        title="Quitar de «Continuar leyendo»"
        aria-label={`Quitar ${record.manga.title} de continuar leyendo`}
        onClick={() => clearReading(record.manga)}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full glass flex items-center justify-center text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <span className="material-symbols-outlined text-[15px]">close</span>
      </button>
    </div>
  );
}

/** Lo último que estabas leyendo, con el punto exacto donde lo dejaste. */
export default function ContinueReadingRow({ onContinue, title = 'Continuar leyendo', limit = 20 }: ContinueReadingRowProps) {
  const records = useMangaData((s) => s.records);
  const history = useMemo(() => historyRecords(records, limit), [records, limit]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  if (history.length === 0) return null;

  const open = async (rec: MangaRecord) => {
    if (busyKey) return;
    setBusyKey(mangaKey(rec.manga));
    try {
      await onContinue(rec);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-3 px-1">
        <h2 className="section-title font-headline text-[19px] font-bold tracking-[-0.02em] text-white">{title}</h2>
        <span className="text-[12px] text-muted">{history.length}</span>
      </div>
      <div ref={scroller} className="flex gap-4 overflow-x-auto pb-3 pt-1 px-1 snap-x ">
        {history.map((rec) => (
          <ContinueCard key={mangaKey(rec.manga)} record={rec} busy={busyKey === mangaKey(rec.manga)} onOpen={() => void open(rec)} />
        ))}
      </div>
    </section>
  );
}
