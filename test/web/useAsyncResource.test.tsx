import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsyncResource } from '~/hooks/useAsyncResource';

describe('useAsyncResource', () => {
  it('exposes the loaded value and reaches ready', async () => {
    const { result } = renderHook(() => useAsyncResource(async () => 'value'));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.data).toBe('value');
    expect(result.current.error).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('records a rejection instead of throwing', async () => {
    // The whole point of the hook: `useProcessing` used to swallow its loader
    // failure, so a failed fetch rendered "no task runs yet" — indistinguishable
    // from an empty history.
    const failure = new Error('network down');
    const { result } = renderHook(() =>
      useAsyncResource(async () => {
        throw failure;
      }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe(failure);
    expect(result.current.data).toBeUndefined();
  });

  it('is loading before the loader settles', async () => {
    let resolve: (value: string) => void = () => undefined;
    const { result } = renderHook(() => useAsyncResource(() => new Promise<string>((r) => (resolve = r))));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });
    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolve('late');
    });
    await waitFor(() => {
      expect(result.current.data).toBe('late');
    });
  });

  it('re-runs the loader on reload', async () => {
    const loader = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() => useAsyncResource(loader));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(loader).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  it('clears a previous error when reloaded successfully', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('first fails')).mockResolvedValueOnce('recovered');
    const { result } = renderHook(() => useAsyncResource(loader));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.data).toBe('recovered');
  });

  it('ignores a response that arrives after unmount', async () => {
    // Otherwise a slow response could resurrect a view the user already left.
    let resolve: (value: string) => void = () => undefined;
    const { result, unmount } = renderHook(() => useAsyncResource(() => new Promise<string>((r) => (resolve = r))));

    unmount();
    await act(async () => {
      resolve('after unmount');
    });

    expect(result.current.data).toBeUndefined();
  });

  it('re-runs when a dependency changes', async () => {
    const loader = vi.fn().mockResolvedValue('ok');
    const { rerender } = renderHook(({ id }: { id: number }) => useAsyncResource(loader, [id]), {
      initialProps: { id: 1 },
    });

    await waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(1);
    });

    rerender({ id: 2 });
    await waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });
});
