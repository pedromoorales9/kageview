import { describe, it, expect } from 'vitest';
import {
  buildAuthorizeUrl, isAllowedOperation, isPlausibleToken, parseAuthCallback, parseManualToken, PendingLogin,
  RateLimiter, retryAfterMs, LOGIN_TTL_MS, MAX_BATCH,
} from '../anilistAuthCore';
import { buildSaveBatch, ENTRY_QUERY, LIST_QUERY, VIEWER_QUERY, SEARCH_MANGA_QUERY } from '../../modules/anilist/sync/queries';

const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxMjM0NSJ9.c2lnbmF0dXJl';

describe('URL de autorización', () => {
  it('flujo implícito con el client_id y un state', () => {
    const u = new URL(buildAuthorizeUrl('12345', 'abc')!);
    expect(u.origin + u.pathname).toBe('https://anilist.co/api/v2/oauth/authorize');
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: '12345', response_type: 'token', state: 'abc' });
  });
  it('un client_id que no es un número no genera URL (evita inyectar parámetros)', () => {
    for (const bad of ['', 'abc', '12 3', '1&response_type=code', '123456789012', undefined as never]) {
      expect(buildAuthorizeUrl(bad, 's')).toBeNull();
    }
  });
});

describe('vuelta de AniList', () => {
  const url = (hash: string) => `kageview://anilist-auth${hash}`;
  it('lee token, validez y state del fragmento', () => {
    expect(parseAuthCallback(url(`#access_token=${TOKEN}&token_type=Bearer&expires_in=31536000&state=xyz`))).toEqual({ token: TOKEN, expiresIn: 31536000, state: 'xyz' });
  });
  it('sin state ni expires_in: valores por defecto razonables', () => {
    expect(parseAuthCallback(url(`#access_token=${TOKEN}`))).toMatchObject({ state: null, expiresIn: 365 * 86400 });
  });
  it('rechaza lo que no es nuestro enlace o no trae un token verosímil', () => {
    expect(parseAuthCallback('https://anilist.co/#access_token=' + TOKEN)).toBeNull();
    expect(parseAuthCallback('kageview://auth-callback#access_token=' + TOKEN)).toBeNull();
    expect(parseAuthCallback(url('#access_token=corto'))).toBeNull();
    expect(parseAuthCallback(url(`#access_token=${TOKEN}&token_type=mac`))).toBeNull();
    expect(parseAuthCallback(url('#access_token=<script>alert(1)</script>aaaaaaaaaaaaaaaa'))).toBeNull();
    expect(parseAuthCallback(url(''))).toBeNull();
    expect(parseAuthCallback('no es una url')).toBeNull();
    expect(parseAuthCallback(url(`#access_token=${'a'.repeat(9000)}`))).toBeNull();
  });
  it('el tiempo de validez se acota', () => {
    expect(parseAuthCallback(url(`#access_token=${TOKEN}&expires_in=99999999999`))!.expiresIn).toBe(2 * 365 * 86400);
    expect(parseAuthCallback(url(`#access_token=${TOKEN}&expires_in=-5`))!.expiresIn).toBe(365 * 86400);
  });
  it('entrada manual: token suelto, fragmento o dirección completa', () => {
    expect(parseManualToken(`  ${TOKEN}  `)!.token).toBe(TOKEN);
    expect(parseManualToken(`access_token=${TOKEN}&expires_in=100`)).toMatchObject({ token: TOKEN, expiresIn: 100 });
    expect(parseManualToken(`https://anilist.co/api/v2/oauth/pin#access_token=${TOKEN}&token_type=Bearer`)!.token).toBe(TOKEN);
    expect(parseManualToken('hola')).toBeNull();
    expect(parseManualToken('')).toBeNull();
  });
  it('isPlausibleToken', () => {
    expect(isPlausibleToken(TOKEN)).toBe(true);
    expect([isPlausibleToken(''), isPlausibleToken('a b'.repeat(10)), isPlausibleToken(null), isPlausibleToken(5)]).toEqual([false, false, false, false]);
  });
});

describe('inicio de sesión pendiente (anti-CSRF)', () => {
  it('sin haber pulsado «Conectar» no se acepta ninguna vuelta', () => {
    expect(new PendingLogin().consume(1000, null)).toBe(false);
  });
  it('se acepta una vez, dentro del plazo', () => {
    const p = new PendingLogin();
    p.start('s1', 1000);
    expect(p.active).toBe(true);
    expect(p.consume(1000 + 5000, 's1')).toBe(true);
    expect(p.consume(1000 + 6000, 's1')).toBe(false);                 // ya consumido: un segundo enlace no vale
    expect(p.active).toBe(false);
  });
  it('caduca', () => {
    const p = new PendingLogin();
    p.start('s1', 0);
    expect(p.consume(LOGIN_TTL_MS + 1, 's1')).toBe(false);
  });
  it('si AniList devuelve un state distinto, se rechaza (y se consume)', () => {
    const p = new PendingLogin();
    p.start('s1', 0);
    expect(p.consume(10, 'otro')).toBe(false);
    expect(p.consume(11, 's1')).toBe(false);
  });
  it('si AniList no devuelve state, vale (la protección es el plazo y el uso único)', () => {
    const p = new PendingLogin();
    p.start('s1', 0);
    expect(p.consume(10, null)).toBe(true);
  });
});

describe('operaciones permitidas con el token', () => {
  it('leer el usuario, la lista y una entrada', () => {
    for (const q of [VIEWER_QUERY, LIST_QUERY, ENTRY_QUERY]) expect(isAllowedOperation(q, {})).toBe(true);
    expect(isAllowedOperation(`  ${VIEWER_QUERY.replace(/ /g, '   ')}\n`, null)).toBe(true);   // da igual el espaciado
  });
  it('lotes de escritura generados por la app (con y sin nota)', () => {
    const batch = buildSaveBatch([
      { mediaId: 1, status: 'CURRENT', progress: 3 },
      { mediaId: 2, status: 'COMPLETED', progress: 12, score: 85 },
      { mediaId: 3, status: 'PLANNING', progress: 0 },
    ]);
    expect(isAllowedOperation(batch.query, batch.variables)).toBe(true);
    expect(isAllowedOperation(buildSaveBatch([{ mediaId: 1, status: 'PAUSED', progress: 0 }]).query, {})).toBe(true);
  });
  it('un lote demasiado grande se rechaza', () => {
    const big = buildSaveBatch(Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ mediaId: i + 1, status: 'CURRENT' as const, progress: 1 })));
    expect(isAllowedOperation(big.query, big.variables)).toBe(false);
  });
  it('NO se puede borrar entradas, tocar la cuenta ni colar campos extra', () => {
    const evil = [
      'mutation { DeleteMediaListEntry(id: 1) { deleted } }',
      'mutation { UpdateUser(about: "x") { id } }',
      'mutation { DeleteCustomList(customList: "x", type: ANIME) { deleted } }',
      buildSaveBatch([{ mediaId: 1, status: 'CURRENT', progress: 1 }]).query.replace('{ id mediaId }', '{ id mediaId user { id } }'),
      buildSaveBatch([{ mediaId: 1, status: 'CURRENT', progress: 1 }]).query + ' mutation { DeleteMediaListEntry(id: 1) { deleted } }',
      buildSaveBatch([{ mediaId: 1, status: 'CURRENT', progress: 1 }]).query.replace('SaveMediaListEntry', 'DeleteMediaListEntry'),
      'query { Viewer { id email } }',
      SEARCH_MANGA_QUERY,                                  // la búsqueda es pública: no necesita (ni lleva) el token
      '', 5, null, undefined,
    ];
    for (const q of evil) expect(isAllowedOperation(q as never, {})).toBe(false);
  });
  it('las variables deben ser un objeto de tamaño razonable', () => {
    expect(isAllowedOperation(VIEWER_QUERY, [1])).toBe(false);
    expect(isAllowedOperation(VIEWER_QUERY, 'x')).toBe(false);
    expect(isAllowedOperation(VIEWER_QUERY, { a: 'x'.repeat(50000) })).toBe(false);
  });
});

describe('ritmo de peticiones', () => {
  it('espacia las peticiones', () => {
    const r = new RateLimiter(750);
    expect([r.reserve(0), r.reserve(0), r.reserve(0)]).toEqual([0, 750, 1500]);
    expect(r.reserve(10_000)).toBe(0);                                   // pasado un rato, sin espera
  });
  it('un 429 retrasa todo lo siguiente', () => {
    const r = new RateLimiter(750);
    r.reserve(0);
    r.penalize(0, 20_000);
    expect(r.reserve(100)).toBe(19_900);
  });
  it('Retry-After en segundos, con tope y valor por defecto', () => {
    expect([retryAfterMs('20'), retryAfterMs('9999'), retryAfterMs(null), retryAfterMs('x'), retryAfterMs('0')]).toEqual([20000, 120000, 30000, 30000, 30000]);
  });
});
