// Utilidades para probar una fuente de manga contra la web REAL (solo con LIVE=1).
//
// Las fuentes hacen sus peticiones por `proxyGet` (proceso principal de Electron, con
// un User-Agent de Chrome y sin CORS). Aquí se sustituye por `fetch` de Node con las
// mismas cabeceras base, y se instala un `DOMParser` real (linkedom) para los parsers HTML.
//
// Uso (copiar `liveTemplate.example.ts` → `provider-<id>.live.test.ts`):
//   LIVE=1 npx vitest run src/modules/manga/__tests__/provider-<id>.live.test.ts
import { parseHTML } from 'linkedom';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Cfg = { params?: Record<string, string | number | string[]>; headers?: Record<string, string>; retries?: number; timeout?: number };

const withParams = (url: string, params?: Cfg['params']) => {
  if (!params) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) (Array.isArray(v) ? v : [v]).forEach((x) => u.searchParams.append(k, String(x)));
  return u.toString();
};

async function run(method: string, url: string, body: unknown, cfg: Cfg) {
  const attempts = 1 + Math.max(0, cfg.retries ?? 0);
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(withParams(url, cfg.params), {
        method,
        headers: { 'User-Agent': UA, ...(cfg.headers ?? {}) },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(cfg.timeout ?? 20000),
        redirect: 'follow',
      });
      const text = await res.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch { /* HTML u otro texto */ }
      if (!res.ok) {
        const err: any = new Error(`Request failed with status ${res.status}`);
        err.status = res.status; err.data = data;
        throw err;
      }
      return { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
    } catch (e) {
      last = e;
      if ((e as any)?.status >= 400 && (e as any)?.status < 500) break;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw last;
}

export const liveProxyGet = (url: string, cfg: Cfg = {}) => run('GET', url, undefined, cfg);
export const liveProxyPost = (url: string, body: unknown, cfg: Cfg = {}) => run('POST', url, body, cfg);

/** Instala `DOMParser` (y `window`) como en el renderizador, para los parsers HTML. */
export function installDom(): void {
  (globalThis as any).DOMParser = class {
    parseFromString(html: string) {
      return parseHTML(html).document;
    }
  };
}

/** Descarga una imagen como lo haría el <img> del lector (con el Referer que se indique). */
export async function fetchImageStatus(url: string, referer?: string): Promise<{ status: number; type: string; bytes: number }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) }, signal: AbortSignal.timeout(20000) });
  const buf = await res.arrayBuffer();
  return { status: res.status, type: res.headers.get('content-type') ?? '', bytes: buf.byteLength };
}
