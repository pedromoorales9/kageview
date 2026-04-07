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
}

export interface ProxyResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, unknown>;
}

/**
 * Make an HTTP request through the Electron main process.
 * Falls back to fetch() if window.electron is not available.
 */
export async function proxyGet<T = unknown>(
  url: string,
  config: Omit<ProxyRequestConfig, 'url' | 'method'> = {}
): Promise<ProxyResponse<T>> {
  if (window.electron?.proxyRequest) {
    const res = await window.electron.proxyRequest({
      method: 'GET',
      url: url, // do not parse here
      params: config.params,
      headers: config.headers,
      timeout: config.timeout,
    });
    if (res.error) {
      throw new Error(res.message || `Request failed with status ${res.status}`);
    }
    return res as ProxyResponse<T>;
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
      throw new Error(res.message || `Request failed with status ${res.status}`);
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
