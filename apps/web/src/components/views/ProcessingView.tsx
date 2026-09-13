import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProcessing } from '../../hooks/useProcessing';
import { formatTimestamp } from '../../lib/format';

export default function ProcessingView({ lng }: { lng: string }) {
  const { t } = useTranslation();
  const { taskRuns, loadTaskRuns } = useProcessing();

  useEffect(() => {
    loadTaskRuns().catch(() => undefined);
  }, [loadTaskRuns]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-4">{t('processing.title', 'Background Task Runs')}</h1>
      {taskRuns.length === 0 ? (
        <div className="p-5 rounded-md border border-[#2d3745] bg-[#171c25] text-[#aab4c2]">
          {t('processing.empty', 'No Task Runs Yet')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#2d3745] bg-[#171c25]">
          <table className="w-full text-sm">
            <thead className="text-[#aab4c2]">
              <tr className="border-b border-[#2d3745]">
                <th className="text-left font-medium py-3 px-4">{t('processing.taskType', 'Task Type')}</th>
                <th className="text-left font-medium py-3 px-4">{t('processing.status', 'Status')}</th>
                <th className="text-left font-medium py-3 px-4">Summary</th>
                <th className="text-left font-medium py-3 px-4">Started</th>
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
    </main>
  );
}
