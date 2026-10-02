import { describe, it, expect } from 'vitest';
import { mergeEntry, Side } from '../merge';
import type { EntrySnap } from '../types';

const snap = (status: EntrySnap['status'], progress: number, score = 0): EntrySnap => ({ status, progress, score });
const side = (status: EntrySnap['status'], progress: number, score = 0, at = 1000): Side => ({ status, progress, score, at });
const run = (base: EntrySnap | null, local: Side | null, remote: Side | null, scoreSynced = true) =>
  mergeEntry({ base, local, remote, scoreSynced });

describe('mergeEntry: primera vez (sin base)', () => {
  it('solo en KageView → se crea en AniList', () => {
    expect(run(null, side('CURRENT', 5), null)).toEqual({ next: snap('CURRENT', 5), toLocal: false, toRemote: true });
  });
  it('solo en AniList → se importa a KageView', () => {
    expect(run(null, null, side('PLANNING', 0))).toEqual({ next: snap('PLANNING', 0), toLocal: true, toRemote: false });
  });
  it('en los dos y distintos: el mayor progreso; estado y nota, del más reciente', () => {
    const r = run(null, side('CURRENT', 30, 0, 2000), side('COMPLETED', 12, 80, 1000));
    expect(r.next).toEqual(snap('CURRENT', 30, 80));          // la nota 0 local no pisa la real
    expect(r).toMatchObject({ toLocal: true, toRemote: true });
  });
  it('en los dos e iguales → no hay nada que escribir', () => {
    expect(run(null, side('CURRENT', 5, 70), side('CURRENT', 5, 70))).toMatchObject({ toLocal: false, toRemote: false });
  });
  it('nada en ningún lado', () => {
    expect(run(null, null, null)).toEqual({ next: null, toLocal: false, toRemote: false });
  });
});

describe('mergeEntry: con base (tres vías)', () => {
  const base = snap('CURRENT', 10, 60);

  it('nada cambió → nada que hacer', () => {
    expect(run(base, side('CURRENT', 10, 60), side('CURRENT', 10, 60))).toMatchObject({ toLocal: false, toRemote: false });
  });
  it('solo cambió KageView → se copia a AniList', () => {
    const r = run(base, side('CURRENT', 14, 60), side('CURRENT', 10, 60));
    expect(r).toEqual({ next: snap('CURRENT', 14, 60), toLocal: false, toRemote: true });
  });
  it('solo cambió AniList → se copia a KageView', () => {
    const r = run(base, side('CURRENT', 10, 60), side('COMPLETED', 20, 90));
    expect(r).toEqual({ next: snap('COMPLETED', 20, 90), toLocal: true, toRemote: false });
  });
  it('los dos cambiaron: gana el progreso mayor y el estado más reciente', () => {
    const r = run(base, side('DROPPED', 12, 60, 5000), side('CURRENT', 18, 60, 3000));
    expect(r.next).toEqual(snap('DROPPED', 18, 60));
    expect(r).toMatchObject({ toLocal: true, toRemote: true });
  });
  it('el usuario BAJA el progreso en KageView (marcar no leído) → se baja también en AniList', () => {
    const r = run(base, side('CURRENT', 7, 60), side('CURRENT', 10, 60));
    expect(r).toEqual({ next: snap('CURRENT', 7, 60), toLocal: false, toRemote: true });
  });
  it('AniList baja el progreso: NO se propaga a KageView (se conserva el mayor)', () => {
    const r = run(base, side('CURRENT', 10, 60), side('CURRENT', 4, 60));
    expect(r.next?.progress).toBe(10);
    expect(r.toLocal).toBe(false);
    expect(r.toRemote).toBe(true);                // se repone en AniList: nunca perder lectura
  });
  it('una nota 0 («sin nota») nunca borra una nota real al resolver un conflicto', () => {
    const r = run(base, side('CURRENT', 12, 0, 9000), side('CURRENT', 15, 85, 1000));
    expect(r.next?.score).toBe(85);
  });
});

describe('mergeEntry: nunca borra solo', () => {
  const base = snap('CURRENT', 10, 0);
  it('estaba sincronizada y se quitó de AniList: no se vuelve a crear mientras no la toques', () => {
    expect(run(base, side('CURRENT', 10), null)).toEqual({ next: base, toLocal: false, toRemote: false });
  });
  it('…pero si la tocas en KageView, sí se recrea en AniList', () => {
    expect(run(base, side('CURRENT', 11), null)).toMatchObject({ toRemote: true, next: snap('CURRENT', 11) });
  });
  it('estaba sincronizada y se quitó de KageView: no se vuelve a importar mientras AniList no cambie', () => {
    expect(run(base, null, side('CURRENT', 10))).toEqual({ next: base, toLocal: false, toRemote: false });
  });
  it('…pero si AniList cambia después, se importa de nuevo', () => {
    expect(run(base, null, side('CURRENT', 12))).toMatchObject({ toLocal: true });
  });
});

describe('mergeEntry: manga (sin nota local)', () => {
  it('la nota de AniList no genera cambios ni se pisa', () => {
    const base = snap('CURRENT', 5, 80);
    const r = run(base, side('CURRENT', 5, 0), side('CURRENT', 5, 80), false);
    expect(r).toMatchObject({ toLocal: false, toRemote: false });
    expect(r.next?.score).toBe(80);
  });
  it('si el progreso local sube, se envía conservando la nota de AniList', () => {
    const base = snap('CURRENT', 5, 80);
    const r = run(base, side('CURRENT', 9, 0), side('CURRENT', 5, 80), false);
    expect(r).toEqual({ next: snap('CURRENT', 9, 80), toLocal: false, toRemote: true });
  });
  it('un manga nuevo local se crea en AniList sin nota (0)', () => {
    expect(run(null, side('PLANNING', 0), null, false).next?.score).toBe(0);
  });
});
