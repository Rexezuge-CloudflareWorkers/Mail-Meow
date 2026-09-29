import { useCallback, useState } from 'react';
import type { BackgroundTaskRun } from '../types';
import * as procSvc from '../services/processingService';
import { useAsyncResource } from './useAsyncResource';

/**
 * Cron task-run history, plus the manual refresh trigger.
 *
 * `loadTaskRuns` deliberately rejects on failure rather than resolving to an
 * empty list. The previous version swallowed the error, so a failed request
 * rendered "no task runs yet" — identical to a genuinely empty history, and the
 * user had no way to tell the cron had stopped working.
 */
export function useProcessing() {
  const [manualTriggerError, setManualTriggerError] = useState<unknown>(undefined);
  const [isTriggering, setIsTriggering] = useState(false);
  const runs = useAsyncResource<{ runs: BackgroundTaskRun[] }>(() => procSvc.listTaskRuns());

  // `reload` is synchronous: it only bumps a nonce that the effect reacts to.
  const loadTaskRuns = useCallback(() => {
    runs.reload();
  }, [runs]);

  /**
   * Refreshes one application's token now instead of waiting for the next tick.
   *
   * Refreshes the list afterwards: the trigger writes a task-run row, so the
   * history the user is looking at is stale the moment it succeeds. Rejecting is
   * left to the caller — this resolves on success and throws on failure, and
   * swallowing it here would hide a failed trigger behind a "done" message.
   */
  const triggerRefresh = useCallback(
    async (applicationId: string): Promise<void> => {
      setIsTriggering(true);
      setManualTriggerError(undefined);
      try {
        await procSvc.runTaskNow('oauth2_refresh', applicationId);
        runs.reload();
      } catch (error: unknown) {
        setManualTriggerError(error);
        throw error;
      } finally {
        setIsTriggering(false);
      }
    },
    [runs],
  );

  return {
    taskRuns: runs.data?.runs ?? [],
    loadTaskRuns,
    error: runs.error,
    isLoading: runs.isLoading,
    manualTriggerError,
    setManualTriggerError,
    triggerRefresh,
    isTriggering,
  };
}
