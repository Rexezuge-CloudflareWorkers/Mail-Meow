import { useTranslation } from 'react-i18next';
import { useProcessing } from '../../hooks/useProcessing';
import { formatTimestamp } from '../../lib/format';

export default function ProcessingView({ lng }: { lng: string }) {
  const { t } = useTranslation();
  const { taskRuns, isLoading, error, triggerRefresh, isTriggering, manualTriggerError } = useProcessing();

  /**
   * Applications whose token can be refreshed right now.
   *
   * Derived from the runs already loaded rather than a second request: the
   * endpoint is per-application, and a run row carries the application id. Rows
   * without one (a whole-batch run) are excluded because there is nothing to
   * target. `oauth2_refresh` is the only whitelisted task type on the server, so
   * offering a button for any other row would only produce a 400.
   */
  const triggerable: string[] = [...new Set(taskRuns.map((run) => run.applicationId).filter((id): id is string => Boolean(id)))];

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-4">{t('processing.title', 'Background Task Runs')}</h1>
      {error ? (
        // Previously any failure fell through to the empty state, so a stopped
        // cron looked exactly like a history that had never run.
        <div role="alert" className="p-5 rounded-md border border-[#7f1d1d] bg-[#2a1618] text-[#fca5a5]">
          {t('processing.loadFailed', 'Could Not Load Task Runs')}
        </div>
      ) : (
        <div aria-busy={isLoading} aria-live="polite">
          {taskRuns.length === 0 ? (
            <div className="p-5 rounded-md border border-[#2d3745] bg-[#171c25] text-[#aab4c2]">
              {isLoading ? t('processing.loading', 'Loading…') : t('processing.empty', 'No Task Runs Yet')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[#2d3745] bg-[#171c25]">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('processing.title', 'Background Task Runs')}</caption>
                <thead className="text-[#aab4c2]">
                  <tr className="border-b border-[#2d3745]">
                    <th scope="col" className="text-left font-medium py-3 px-4">
                      {t('processing.taskType', 'Task Type')}
                    </th>
                    <th scope="col" className="text-left font-medium py-3 px-4">
                      {t('processing.status', 'Status')}
                    </th>
                    <th scope="col" className="text-left font-medium py-3 px-4">
                      {t('processing.summary', 'Summary')}
                    </th>
                    <th scope="col" className="text-left font-medium py-3 px-4">
                      {t('processing.started', 'Started')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {taskRuns.map((run) => (
                    <tr key={run.runId} className="border-b border-[#242b36]">
                      <td className="py-3 px-4">{run.taskType}</td>
                      <td className="py-3 px-4">{run.status}</td>
                      <td className="py-3 px-4 text-[#aab4c2]">{run.summary ?? ''}</td>
                      <td className="py-3 px-4 text-[#aab4c2]">{formatTimestamp(run.startedAt, lng)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/*
            The manual trigger. `POST /user/processing/run-task` has been live
            and tested since it shipped, but nothing in the SPA called it, so
            the feature was reachable only by hand-writing a request. Offered
            per row because the endpoint is per-application: `runId` is not
            an application id, and the only rows that can be triggered are
            OAuth2 refreshes, which is the sole whitelisted task type.
          */}
          {triggerable.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-2">{t('processing.manual', 'Manual Refresh')}</h2>
              {manualTriggerError ? (
                <div role="alert" className="mb-3 p-3 rounded-md border border-[#7f1d1d] bg-[#2a1618] text-[#fca5a5]">
                  {t('processing.triggerFailed', 'Could Not Trigger Refresh')}
                </div>
              ) : null}
              <ul className="space-y-2">
                {triggerable.map((applicationId) => (
                  <li
                    key={applicationId}
                    className="flex items-center justify-between gap-4 p-3 rounded-md border border-[#2d3745] bg-[#171c25]"
                  >
                    <span className="text-sm text-[#aab4c2] truncate">{applicationId}</span>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-md bg-[#0f766e] hover:bg-[#0d9488] disabled:opacity-50"
                      disabled={isTriggering}
                      onClick={() => {
                        // The hook records the failure for the alert above;
                        // swallowing it here would leave the promise unhandled
                        // and the button silently doing nothing.
                        void triggerRefresh(applicationId).catch(() => undefined);
                      }}
                    >
                      {t('processing.runNow', 'Run Now')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
