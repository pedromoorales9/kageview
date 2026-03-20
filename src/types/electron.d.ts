export {};

declare global {
  interface Window {
    electron: {
      getStore: (key: string) => Promise<unknown>;
      setStore: (key: string, value: unknown) => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      proxyRequest: (config: {
        method: string;
        url: string;
        params?: Record<string, string | number | string[]>;
        headers?: Record<string, string>;
        data?: unknown;
        timeout?: number;
        maxRedirects?: number;
        validateStatus?: string;
      }) => Promise<{
        status: number;
        data: unknown;
        headers: Record<string, unknown>;
        error?: boolean;
        message?: string;
      }>;
      onOAuthCode: (cb: (code: string) => void) => void;
      removeOAuthListener: () => void;
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      platform: string;
    };
  }
}
