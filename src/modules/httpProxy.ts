// ═══════════════════════════════════════════════════════════
// httpProxy — Wrapper around window.electron.proxyRequest
// All provider HTTP calls should use this instead of axios
// to route through the main process and bypass CORS.
// ═══════════════════════════════════════════════════════════

export interface ProxyRequestConfig {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: unknown;
  params?: Record<string, string | number | string[]>;
  timeout?: number;
  maxRedirects?: number;
  validateStatus?: string;
  /** Reintentos ante fallo (errores de red o 5xx). Solo para GET. */
  retries?: number;
}

export interface ProxyResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, unknown>;
}

/** Error HTTP del proxy que conserva el status y el cuerpo de la respuesta. */
export class ProxyHttpError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ProxyHttpError';
    this.status = status;
    this.data = data;
  }
}

const RETRY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Make an HTTP request through the Electron main process.
 * Falls back to fetch() if window.electron is not available.
 *
 * Con `retries: n`, ante un error de red o un 5xx (hostings tipo Railway
 * "despertando") espera 1,5s y reintenta hasta n veces. Los 4xx no se
 * reintentan: son errores definitivos.
 */
export async function proxyGet<T = unknown>(
  url: string,
  config: Omit<ProxyRequestConfig, 'url' | 'method'> = {}
): Promise<ProxyResponse<T>> {
  if (window.electron?.proxyRequest) {
    const attempts = 1 + Math.max(0, config.retries ?? 0);
    let lastError: Error = new Error('Request failed');

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAY_MS);

      const res = await window.electron.proxyRequest({
        method: 'GET',
        url: url, // do not parse here
        params: config.params,
        headers: config.headers,
        timeout: config.timeout,
      });
      if (!res.error) return res as ProxyResponse<T>;

      lastError = new ProxyHttpError(
        res.message || `Request failed with status ${res.status}`,
        res.status,
        res.data
      );
      // 4xx = definitivo, no reintentar; 0 (red) y 5xx sí
      if (res.status >= 400 && res.status < 500) break;
    }
    throw lastError;
  }

  // Fallback for testing outside Electron
  const fullUrl = config.params
    ? `${url}?${new URLSearchParams(config.params as Record<string, string>).toString()}`
    : url;
  const resp = await fetch(fullUrl, { headers: config.headers as HeadersInit });
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: resp.status, data: data as T, headers: {} };
}

export async function proxyPost<T = unknown>(
  url: string,
  body: unknown,
  config: Omit<ProxyRequestConfig, 'url' | 'method' | 'data'> = {}
): Promise<ProxyResponse<T>> {
  if (window.electron?.proxyRequest) {
    const res = await window.electron.proxyRequest({
      method: 'POST',
      url,
      headers: config.headers,
      data: body,
      timeout: config.timeout,
      maxRedirects: config.maxRedirects,
      validateStatus: config.validateStatus,
    });
    if (res.error) {
      throw new ProxyHttpError(
        res.message || `Request failed with status ${res.status}`,
        res.status,
        res.data
      );
    }
    return res as ProxyResponse<T>;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: config.headers as HeadersInit,
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return { status: resp.status, data: data as T, headers: {} };
}

export async function proxyHead(
  url: string,
  config: Omit<ProxyRequestConfig, 'url' | 'method'> = {}
): Promise<{ status: number }> {
  if (window.electron?.proxyRequest) {
    const res = await window.electron.proxyRequest({
      method: 'HEAD',
      url,
      headers: config.headers,
      timeout: config.timeout || 3000,
    });
    return { status: res.error ? 0 : res.status };
  }
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    return { status: resp.status };
  } catch {
    return { status: 0 };
  }
}
