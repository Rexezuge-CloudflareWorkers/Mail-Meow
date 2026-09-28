const DEFAULT_PRUNE_BATCH_SIZE = 500;

/**
 * Upper bound on batches per invocation.
 *
 * Pruning runs inside a Durable Object request, so an unbounded loop over a large
 * backlog issues thousands of sequential D1 round trips and exhausts the CPU
 * budget partway through — Cloudflare error 1102 — leaving the work half done and
 * the run reported as a failure. Capping the batches lets the next cron tick
 * continue from where this one stopped.
 */
const DEFAULT_PRUNE_MAX_BATCHES = 20;

const SECONDS_PER_DAY = 86_400;

function computeUnixCutoffSeconds(retentionDays: number, nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) - retentionDays * SECONDS_PER_DAY;
}

function computeDateCutoffIso(retentionDays: number, nowMs: number = Date.now()): string {
  const date: Date = new Date(nowMs - retentionDays * SECONDS_PER_DAY * 1000);
  return date.toISOString().split('T', 1)[0] ?? date.toISOString().slice(0, 10);
}

/**
 * Deletes rows in batches until a short batch signals the backlog is drained.
 *
 * `maxBatches` bounds the work per call. When the cap is hit the function returns
 * the number deleted so far, and the caller can report progress rather than
 * failing mid-loop.
 */
async function pruneInBatches(
  deleteBatch: (batchSize: number) => Promise<number>,
  batchSize: number = DEFAULT_PRUNE_BATCH_SIZE,
  maxBatches: number = DEFAULT_PRUNE_MAX_BATCHES,
): Promise<{ deleted: number; exhausted: boolean }> {
  let total = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const deleted: number = await deleteBatch(batchSize);
    total += deleted;
    if (deleted < batchSize) {
      // A short batch means the backlog is drained.
      return { deleted: total, exhausted: true };
    }
  }
  // The cap was reached with at least one full batch left to delete.
  return { deleted: total, exhausted: false };
}

export { DEFAULT_PRUNE_BATCH_SIZE, DEFAULT_PRUNE_MAX_BATCHES, computeDateCutoffIso, computeUnixCutoffSeconds, pruneInBatches };
