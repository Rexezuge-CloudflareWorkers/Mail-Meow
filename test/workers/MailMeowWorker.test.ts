import { MailMeowWorker } from '@/workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const executionContext: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

describe('MailMeowWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects root visits to the user console', async () => {
    const worker = new MailMeowWorker();

    const response = await worker.fetch(new Request('https://mail.example.com/'), {} as Env, executionContext);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/user/');
  });

  /**
   * The configuration warnings have to reach a log, or the ladder behind them is
   * decoration. `AppConfigReader.validate()` reports the things a request can
   * still succeed through but an operator needs to know: a misspelled setting that
   * silently took its default, a dev bypass left set in production, an API-key
   * default above its own maximum.
   *
   * Nothing else in the codebase called it, so until now the only consumer of
   * those warnings was this file.
   */
  describe('configuration warnings', () => {
    it('reports a misspelled setting once, not once per request', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const worker = new MailMeowWorker();
      // A fresh object identity: the memo is keyed on `env`, so a test cannot reuse
      // another test's already-warned object and see nothing.
      const env = { DB: {}, MAX_APPLICATIONS_PER_USE: '7' } as unknown as Env;

      await worker.fetch(new Request('https://mail.example.com/'), env, executionContext);
      await worker.fetch(new Request('https://mail.example.com/'), env, executionContext);

      const reported = warn.mock.calls.map((call) => String(call[0]));
      expect(reported.filter((line) => line.includes('MAX_APPLICATIONS_PER_USE'))).toHaveLength(1);
    });

    it('re-reports when the deployment changes', async () => {
      // A warm isolate outlives a deployment and keeps its module state, so keying
      // the memo on `env` identity is what makes the check run again for the new one.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const worker = new MailMeowWorker();

      await worker.fetch(new Request('https://mail.example.com/'), { DB: {}, TYPO_HERE: '1' } as unknown as Env, executionContext);
      await worker.fetch(new Request('https://mail.example.com/'), { DB: {}, OTHER_TYPO: '1' } as unknown as Env, executionContext);

      const reported = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(reported).toContain('TYPO_HERE');
      expect(reported).toContain('OTHER_TYPO');
    });

    it('says nothing about a clean environment', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const worker = new MailMeowWorker();

      await worker.fetch(new Request('https://mail.example.com/'), { DB: {} } as unknown as Env, executionContext);

      // A warning nobody can act on trains people to ignore the ones they can, and
      // `env` carries bindings and secrets that are not settings.
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
