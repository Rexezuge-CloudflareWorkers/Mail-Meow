import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';

const listApiKeys = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('~/services/applicationService', () => ({
  listApiKeys,
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  listApplications: vi.fn(),
}));
vi.mock('~/services/userService', () => ({ getCurrentUser }));

import { useApiKeys } from '~/hooks/useApiKeys';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useNotice } from '~/hooks/useNotice';
import StatusBadge from '~/components/shared/StatusBadge';
import Unauthorized from '~/components/shared/Unauthorized';
import HelpView from '~/components/views/HelpView';

describe('useApiKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the keys for a selected application', async () => {
    listApiKeys.mockResolvedValue({ apiKeys: [{ apiKeyId: 'k1' }, { apiKeyId: 'k2' }] });
    const { result } = renderHook(() => useApiKeys());

    await act(async () => {
      await result.current.loadApiKeys('app-1');
    });

    expect(listApiKeys).toHaveBeenCalledWith('app-1');
    expect(result.current.apiKeys).toHaveLength(2);
  });

  it('clears the list when no application is selected', async () => {
    listApiKeys.mockResolvedValue({ apiKeys: [{ apiKeyId: 'k1' }] });
    const { result } = renderHook(() => useApiKeys());

    await act(async () => {
      await result.current.loadApiKeys('app-1');
    });
    expect(result.current.apiKeys).toHaveLength(1);

    await act(async () => {
      await result.current.loadApiKeys('');
    });

    // Leaving the previous application's keys on screen would invite revoking the
    // wrong key.
    expect(result.current.apiKeys).toEqual([]);
    // The service must not be called for an empty selection.
    expect(listApiKeys).toHaveBeenCalledTimes(1);
  });

  it('surfaces a load failure to the caller', async () => {
    listApiKeys.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useApiKeys());

    // Rejects rather than resolving to an empty list, so a failed fetch is never
    // mistaken for "this application has no keys".
    await expect(result.current.loadApiKeys('app-1')).rejects.toThrow('boom');
  });
});

describe('useCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in an unresolved state', () => {
    // Authorized is tri-state: null means "not decided yet", which is distinct
    // from false and must not flash the Unauthorized screen on first paint.
    const { result } = renderHook(() => useCurrentUser());
    expect(result.current.authorized).toBeNull();
  });

  it('reports unauthorized when the profile cannot be loaded', async () => {
    getCurrentUser.mockRejectedValue(new Error('401'));
    const { result } = renderHook(() => useCurrentUser());

    await act(async () => {
      await result.current.loadCurrentUser();
    });

    expect(result.current.authorized).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('reports authorized with the loaded profile', async () => {
    const profile = { email: 'me@example.com', preferredLanguage: 'en', limits: { maxApplicationsPerUser: 99 } };
    getCurrentUser.mockResolvedValue(profile);
    const { result } = renderHook(() => useCurrentUser());

    await act(async () => {
      await result.current.loadCurrentUser();
    });

    expect(result.current.authorized).toBe(true);
    expect(result.current.user).toEqual(profile);
  });
});

describe('useNotice', () => {
  it('starts empty, shows a notice, and can be dismissed', () => {
    const { result } = renderHook(() => useNotice());
    expect(result.current.notice).toBeNull();

    act(() => {
      result.current.showNotice('error', 'Boom');
    });
    expect(result.current.notice).toEqual({ type: 'error', text: 'Boom' });

    act(() => {
      result.current.clearNotice();
    });
    expect(result.current.notice).toBeNull();
  });

  it('clears the notice automatically after the timeout', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNotice());

    act(() => {
      result.current.showNotice('success', 'Saved');
    });
    expect(result.current.notice).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(result.current.notice).toBeNull();

    vi.useRealTimers();
  });
});

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="connected" />);
    expect(screen.getByText('connected')).toBeInTheDocument();
  });
});

describe('Unauthorized', () => {
  it('offers a Zero Trust sign-in action', () => {
    render(<Unauthorized />);
    expect(screen.getByRole('button', { name: /Authenticate with Cloudflare Zero Trust/i })).toBeInTheDocument();
  });
});

describe('HelpView', () => {
  it('renders a top-level heading and a section heading', () => {
    render(<HelpView />);
    // Exactly one h1: more than one would give assistive tech several competing
    // page titles.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(2);
  });

  it('explains the OAuth2 setup', () => {
    render(<HelpView />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('OAuth2 Setup');
  });
});
