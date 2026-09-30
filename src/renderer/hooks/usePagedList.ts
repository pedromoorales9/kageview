import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagedList<T> {
  items: T[];
  /** Primera página en curso. */
  loading: boolean;
  /** Páginas siguientes en curso. */
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  reload: () => void;
}

/**
 * Lista paginada. Al cambiar `deps` (fuente, filtro, búsqueda…) vuelve a la
 * página 1 y descarta cualquier respuesta que llegue tarde de la anterior.
 * Se considera que hay más mientras cada página venga llena (`pageSize`).
 */
export function usePagedList<T>(
  fetchPage: (page: number) => Promise<T[]>,
  keyOf: (item: T) => string,
  pageSize: number,
  deps: readonly unknown[],
  enabled = true
): PagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const pageRef = useRef(1);
  const token = useRef(0);
  const busy = useRef(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => {
    const mine = ++token.current;
    pageRef.current = 1;
    busy.current = false;
    setItems([]);
    setHasMore(false);
    setLoadingMore(false);
    setError(null);
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchRef
      .current(1)
      .then((page) => {
        if (token.current !== mine) return;
        const seen = new Set<string>();
        setItems(page.filter((it) => (seen.has(keyOf(it)) ? false : (seen.add(keyOf(it)), true))));
        setHasMore(page.length >= pageSize);
      })
      .catch((e) => {
        if (token.current === mine) setError(e instanceof Error ? e.message : 'Error de conexión');
      })
      .finally(() => {
        if (token.current === mine) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick]);

  const loadMore = useCallback(() => {
    if (busy.current || loading || !hasMore) return;
    busy.current = true;
    const mine = token.current;
    const next = pageRef.current + 1;
    setLoadingMore(true);
    fetchRef
      .current(next)
      .then((page) => {
        if (token.current !== mine) return;
        pageRef.current = next;
        setItems((prev) => {
          const seen = new Set(prev.map(keyOf));
          return [...prev, ...page.filter((it) => !seen.has(keyOf(it)))];
        });
        setHasMore(page.length >= pageSize);
      })
      .catch(() => {
        // un fallo al cargar más no borra lo que ya hay: se puede reintentar
        if (token.current === mine) setHasMore(true);
      })
      .finally(() => {
        busy.current = false;
        if (token.current === mine) setLoadingMore(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasMore]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { items, loading, loadingMore, hasMore, error, loadMore, reload };
}
