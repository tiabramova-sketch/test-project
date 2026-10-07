import { useCallback, useEffect, useState } from 'react';

interface LoaderState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/** Loads async data on mount and whenever `reload` is called. `load` must be stable. */
export function useLoader<T>(load: () => Promise<T>) {
  const [state, setState] = useState<LoaderState<T>>({ data: undefined, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : String(error), loading: false }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
