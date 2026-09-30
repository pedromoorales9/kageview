import { describe, it, expect } from 'vitest';
import { describeAudit } from '../format';
import { barPath, niceMax } from '../chartMath';
import type { AuditEntry } from '../../../../modules/backend';

const entry = (action: string, target: string | null, detail: Record<string, unknown> = {}): AuditEntry => ({
  id: 1, actor: 'kage', action, target, detail, createdAt: '2026-10-01T10:00:00Z',
});

describe('niceMax (eje de la gráfica)', () => {
  it('siempre es par y cubre el máximo, para que la marca central sea un entero', () => {
    for (const v of [0, 1, 3, 4, 5, 9, 10, 11, 37, 99, 101, 450, 501, 999, 4321]) {
      const m = niceMax(v);
      expect(m).toBeGreaterThanOrEqual(v);
      expect(m % 2).toBe(0);
    }
    expect(niceMax(1)).toBe(4);
    expect(niceMax(9)).toBe(10);
    expect(niceMax(37)).toBe(40);
    expect(niceMax(501)).toBe(600);
    expect(niceMax(4321)).toBe(5000);
  });

  it('la columna redondea solo el extremo superior y nunca se sale de su altura', () => {
    // columna de 24 px de ancho y 40 de alto, sobre la base y=100
    expect(barPath(10, 60, 24, 100)).toBe('M10,100 V64 Q10,60 14,60 H30 Q34,60 34,64 V100 Z');
    // una columna muy baja reduce el radio para no invertirse
    expect(barPath(0, 99, 24, 100)).toBe('M0,100 V100 Q0,99 1,99 H23 Q24,99 24,100 V100 Z');
  });
});

describe('describeAudit', () => {
  it('describe cada acción en español y la agrupa', () => {
    const cases: Array<[AuditEntry, string, string]> = [
      [entry('announcement.create', '3', { title: 'Hola' }), 'announcement', 'publicó el anuncio «Hola»'],
      [entry('announcement.delete', '3', { title: 'Hola' }), 'announcement', 'eliminó el anuncio «Hola»'],
      [entry('announcement.pause', '3', {}), 'announcement', 'pausó el anuncio #3'],
      [entry('service.disable', 'animeflv', { reason: 'Caído' }), 'service', 'desactivó AnimeFLV — «Caído»'],
      [entry('service.enable', 'jkanime'), 'service', 'reactivó JKAnime'],
      [entry('user.suspend', 'mika', { reason: 'Spam' }), 'user', 'suspendió a @mika — «Spam»'],
      [entry('user.unsuspend', 'mika'), 'user', 'reactivó a @mika'],
      [entry('team.role', 'sora', { from: 'user', to: 'admin' }), 'team', 'nombró administrador a @sora'],
      [entry('team.role', 'sora', { from: 'admin', to: 'user' }), 'team', 'quitó el rol de administrador a @sora'],
    ];
    for (const [e, group, text] of cases) {
      const v = describeAudit(e);
      expect(v.group).toBe(group);
      expect(v.text).toBe(text);
    }
  });

  it('una acción desconocida no rompe la pantalla', () => {
    expect(describeAudit(entry('algo.nuevo', null)).text).toBe('algo.nuevo');
  });
});
