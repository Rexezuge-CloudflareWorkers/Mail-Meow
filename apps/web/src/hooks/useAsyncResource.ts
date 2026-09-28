import { useCallback, useEffect, useRef, useState } from 'react';

type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AsyncResource<T> {
  data: T | undefined;
  error: unknown;
  status: AsyncStatus;
  isLoading: boolean;
  /**
  Re-runs `loader`. Safe to call concurrently; the last call wins.
  */
  reload: () => void;
}

/**
 * Runs an async loader and tracks its lifecycle in one place.
 *
 * Every data hook in this app previously called its service directly and left
 * the caller to handle rejection. Two of the three callers did not:
 * `useProcessing` swallowed the failure with `.catch(() => undefined)`, so a
 * failed request rendered "no task runs yet" — indistinguishable from an empty
 * history — and `SpaApp` treated a transient application-list failure as an
 * authentication failure, bouncing the user to the Unauthorized screen even
 * though Access had already admitted them.
 *
 * Centralising the lifecycle here means a new hook cannot forget the error
 * branch, and callers get `error` instead of having to guess.
 */
export function useAsyncResource<T>(loader: () => Promise<T>, deps: readonly unknown[] = []): AsyncResource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      // Without this, a slow response would set state on an unmounted component
      // and could resurrect a view the user already navigated away from.
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Deferred so the "loading" state is not set synchronously inside the effect,
    // which would cause an extra render pass before the fetch even starts.
    queueMicrotask(() => {
      if (cancelled || !mounted.current) {
        return;
      }

      setStatus('loading');
      setError(undefined);
    });

    loader()
      .then((result: T) => {
        if (cancelled || !mounted.current) return;
        setData(result);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled || !mounted.current) return;
        // Recorded, not swallowed: the caller decides whether to surface it.
        setError(reason);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's dependency list, by design
  }, [...deps, nonce]);

  const reload = useCallback(() => {
    setNonce((current) => current + 1);
  }, []);

  return { data, error, status, isLoading: status === 'loading', reload };
}

export type { AsyncResource, AsyncStatus };
