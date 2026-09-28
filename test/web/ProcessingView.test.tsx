import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listTaskRuns = vi.hoisted(() => vi.fn());
const runTaskNow = vi.hoisted(() => vi.fn());
vi.mock('~/services/processingService', () => ({ listTaskRuns, runTaskNow }));

import ProcessingView from '~/components/views/ProcessingView';

const RUN = {
  runId: 'run-1',
  taskType: 'oauth2_refresh',
  status: 'success',
  summary: 'Refreshed 1 of 1 tokens',
  startedAt: 1_700_000_000,
};

const RUN_WITH_APP = { ...RUN, applicationId: 'app-42' };

describe('ProcessingView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the run history', async () => {
    listTaskRuns.mockResolvedValue({ runs: [RUN] });

    render(<ProcessingView lng="en" />);

    expect(await screen.findByText('Refreshed 1 of 1 tokens')).toBeInTheDocument();
    expect(screen.getByText('oauth2_refresh')).toBeInTheDocument();
  });

  it('shows the empty state when there is genuinely no history', async () => {
    listTaskRuns.mockResolvedValue({ runs: [] });

    render(<ProcessingView lng="en" />);

    expect(await screen.findByText('No Task Runs Yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a load failure instead of showing the empty state', async () => {
    // The core regression: the fetch failure was swallowed, so a stopped cron
    // rendered "No Task Runs Yet" — indistinguishable from an empty history.
    listTaskRuns.mockRejectedValue(new Error('boom'));

    render(<ProcessingView lng="en" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could Not Load Task Runs');
    expect(screen.queryByText('No Task Runs Yet')).toBeNull();
  });

  it('gives the table a caption and column scopes', async () => {
    listTaskRuns.mockResolvedValue({ runs: [RUN] });

    const { container } = render(<ProcessingView lng="en" />);
    await screen.findByText('Refreshed 1 of 1 tokens');

    expect(container.querySelector('caption')).not.toBeNull();
    // Without scope="col" a screen reader cannot associate a cell with its header.
    expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(4);
  });

  it('marks the region busy while loading', async () => {
    let resolve: (value: { runs: (typeof RUN)[] }) => void = () => undefined;
    listTaskRuns.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<ProcessingView lng="en" />);

    await waitFor(() => {
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });
    resolve({ runs: [] });
    await screen.findByText('No Task Runs Yet');
  });
});

describe('ProcessingView manual refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTaskNow.mockResolvedValue({ triggered: true });
  });

  it('triggers a refresh for the application behind a run', async () => {
    // `POST /user/processing/run-task` has been live and tested since it
    // shipped, but nothing in the SPA called it — the feature was reachable
    // only by hand-writing a request.
    listTaskRuns.mockResolvedValue({ runs: [RUN_WITH_APP] });

    render(<ProcessingView lng="en" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Run Now' }));

    expect(runTaskNow).toHaveBeenCalledWith('oauth2_refresh', 'app-42');
  });

  it('offers no control for a run with no application', async () => {
    // A whole-batch run has no single application to target, so a button there
    // could only ever produce a 400.
    listTaskRuns.mockResolvedValue({ runs: [RUN] });

    render(<ProcessingView lng="en" />);
    await screen.findByText('Refreshed 1 of 1 tokens');

    expect(screen.queryByRole('button', { name: 'Run Now' })).toBeNull();
  });

  it('lists each application once even with several runs', async () => {
    listTaskRuns.mockResolvedValue({ runs: [RUN_WITH_APP, { ...RUN_WITH_APP, runId: 'run-2' }] });

    render(<ProcessingView lng="en" />);
    await screen.findByRole('button', { name: 'Run Now' });

    expect(screen.getAllByRole('button', { name: 'Run Now' })).toHaveLength(1);
  });

  it('surfaces a failed trigger instead of failing silently', async () => {
    listTaskRuns.mockResolvedValue({ runs: [RUN_WITH_APP] });
    runTaskNow.mockRejectedValue(new Error('not connected'));

    render(<ProcessingView lng="en" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Run Now' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => a.textContent?.includes('Could Not Trigger Refresh'))).toBe(true);
  });

  it('reloads the history after a successful trigger', async () => {
    // The trigger writes a task-run row, so the table is stale the moment it
    // succeeds.
    listTaskRuns.mockResolvedValue({ runs: [RUN_WITH_APP] });

    render(<ProcessingView lng="en" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Run Now' }));

    await waitFor(() => expect(listTaskRuns).toHaveBeenCalledTimes(2));
  });
});
