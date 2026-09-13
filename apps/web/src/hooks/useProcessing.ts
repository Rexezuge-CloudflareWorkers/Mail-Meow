import { useCallback, useState } from 'react';
import type { BackgroundTaskRun } from '../types';
import * as procSvc from '../services/processingService';

export function useProcessing() {
  const [taskRuns, setTaskRuns] = useState<BackgroundTaskRun[]>([]);

  const loadTaskRuns = useCallback(async () => {
    const data = await procSvc.listTaskRuns();
    setTaskRuns(data.runs);
  }, []);

  return { taskRuns, loadTaskRuns };
}
