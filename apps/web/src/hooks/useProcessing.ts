import { useCallback, useState } from 'react';
import type { BackgroundTaskRun } from '../types';
import * as procSvc from '../services/processingService';
import { useAsyncResource } from './useAsyncResource';

/**
 * Cron task-run history.
 *
 * `loadTaskRuns` deliberately rejects on failure rather than resolving to an
 * empty list. The previous version swallowed the error, so a failed request
 * rendered "no task runs yet" — identical to a genuinely empty history, and the
 * user had no way to tell the cron had stopped working.
 */
export function useProcessing() {
  const [manualTriggerError, setManualTriggerError] = useState<unknown>(undefined);
  const runs = useAsyncResource<{ runs: BackgroundTaskRun[] }>(() => procSvc.listTaskRuns());

  // `reload` is synchronous: it only bumps a nonce that the effect reacts to.
  const loadTaskRuns = useCallback(() => {
    runs.reload();
  }, [runs]);

  return {
    taskRuns: runs.data?.runs ?? [],
    loadTaskRuns,
    error: runs.error,
    isLoading: runs.isLoading,
    manualTriggerError,
    setManualTriggerError,
  };
}
