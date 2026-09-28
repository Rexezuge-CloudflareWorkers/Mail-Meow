import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const listTaskRuns = vi.hoisted(() => vi.fn());
vi.mock('~/services/processingService', () => ({ listTaskRuns }));

import ProcessingView from '~/components/views/ProcessingView';

const RUN = {
  runId: 'run-1',
  taskType: 'oauth2_refresh',
  status: 'success',
  summary: 'Refreshed 1 of 1 tokens',
  startedAt: 1_700_000_000,
};

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
