import { apiGet, apiPost } from '../lib/api';
import type { BackgroundTaskRun } from '../types';

export async function listTaskRuns(params?: { taskType?: string; applicationId?: string }): Promise<{ runs: BackgroundTaskRun[]; nextCursor?: string }> {
  return apiGet<{ runs: BackgroundTaskRun[]; nextCursor?: string }>('/user/processing/task-runs', params);
}

export async function runTaskNow(taskType: string, applicationId: string): Promise<{ triggered: boolean }> {
  return apiPost<{ triggered: boolean }>('/user/processing/run-task', { taskType, applicationId });
}
