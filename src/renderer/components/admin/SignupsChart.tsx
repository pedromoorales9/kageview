import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SignupPoint, getBackend } from '../../../modules/backend';
import { errorMessage } from '../../../modules/account';
import Spinner from '../ui/Spinner';
import { Notice } from '../account/formKit';
import { Segmented, SmallButton } from './adminKit';
import { barPath, niceMax } from './chartMath';

// ─── Geometría (viewBox fijo; el SVG escala al ancho disponible) ───
const W = 760;
const H = 230;
const PAD = { top: 12, right: 8, bottom: 26, left: 34 };
const MAX_BAR = 24; // grosor máximo de la columna
const BAR = '#ff3d5a'; // luna carmesí (única serie: no hace falta leyenda)
const BAR_HOVER = '#ff8fa8';

const dayShort = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const dayLong = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

export function SignupsChartView({ points }: { points: SignupPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const total = useMemo(() => points.reduce((t, p) => t + p.count, 0), [points]);
  const max = niceMax(Math.max(1, ...points.map((p) => p.count)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / points.length;
  const barW = Math.min(MAX_BAR, band * 0.62);
  const base = PAD.top + plotH;
  const yOf = (n: number) => base - (n / max) * plotH;
  const ticks = [0, max / 2, max];

  const onMove = (e: React.MouseEvent) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W - PAD.left;
    const i = Math.floor(x / band);
    setHover(i >= 0 && i < points.length ? i : null);
  };

  const hp = hover !== null ? points[hover] : null;
  const hx = hover !== null ? PAD.left + band * hover + band / 2 : 0;

  if (table) {
    return (
      <div>
        <div className="flex justify-end mb-2"><SmallButton onClick={() => setTable(false)}>Ver gráfica</SmallButton></div>
        <div className="max-h-[230px] overflow-y-auto rounded-xl bg-white/[0.03]">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Registros por día</caption>
            <thead className="sticky top-0 bg-[#130a11] text-muted text-left">
              <tr><th className="py-2 px-3 font-medium">Día</th><th className="py-2 px-3 font-medium text-right">Registros</th></tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-t-[0.5px] border-white/[0.06]">
                  <td className="py-1.5 px-3 text-on-surface-variant capitalize">{dayLong(p.day)}</td>
                  <td className="py-1.5 px-3 text-right text-white tabular-nums">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-1"><SmallButton onClick={() => setTable(true)}>Ver como tabla</SmallButton></div>
      <div ref={wrap} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block"
          role="img"
          aria-label={`Registros por día en los últimos ${points.length} días: ${total} en total`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yOf(t)} y2={yOf(t)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
              <text x={PAD.left - 8} y={yOf(t) + 4} textAnchor="end" fontSize={11} fill="currentColor" className="text-muted tabular-nums">{t}</text>
            </g>
          ))}
          {points.map((p, i) => {
            if (p.count === 0) return null;
            const x = PAD.left + band * i + (band - barW) / 2;
            return <path key={p.day} d={barPath(x, yOf(p.count), barW, base)} fill={hover === i ? BAR_HOVER : BAR} />;
          })}
          {points.map((p, i) =>
            i % 7 === (points.length - 1) % 7 ? (
              <text key={p.day} x={PAD.left + band * i + band / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="currentColor" className="text-muted">
                {dayShort(p.day)}
              </text>
            ) : null
          )}
          {hp && <line x1={hx} x2={hx} y1={PAD.top} y2={base} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />}
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-lg bg-[#1d1119] hairline shadow-lg text-[12px] whitespace-nowrap"
            style={{ left: `${(hx / W) * 100}%`, top: `${(Math.max(yOf(hp.count), PAD.top + 14) / H) * 100}%`, marginTop: -6 }}
          >
            <p className="text-on-surface-variant capitalize">{dayLong(hp.day)}</p>
            <p className="text-white font-semibold tabular-nums">{hp.count} {hp.count === 1 ? 'registro' : 'registros'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Tarjeta con selector de rango que carga sus propios datos. */
export default function SignupsChart() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [points, setPoints] = useState<SignupPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    getBackend()!
      .adminSignups(days)
      .then((p) => { if (!cancelled) { setPoints(p); setError(null); } })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [days]);

  const total = points?.reduce((t, p) => t + p.count, 0) ?? 0;

  return (
    <section className="panel p-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Registros por día</h3>
          <p className="mt-2 font-headline text-[30px] leading-none font-bold text-white tracking-[-0.03em]">
            {points ? total : '—'}
            <span className="ml-2 text-[13px] font-normal text-muted tracking-normal">nuevos usuarios en {days} días</span>
          </p>
        </div>
        <Segmented
          label="Rango"
          value={String(days) as '7' | '30' | '90'}
          onChange={(v) => setDays(Number(v) as 7 | 30 | 90)}
          options={[{ value: '7', label: '7 d' }, { value: '30', label: '30 d' }, { value: '90', label: '90 d' }]}
        />
      </div>
      {error ? <Notice kind="error">{error}</Notice> : !points ? (
        <div className="flex justify-center py-16"><Spinner size={24} /></div>
      ) : (
        <SignupsChartView points={points} />
      )}
    </section>
  );
}
