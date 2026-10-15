import { useApplications } from './useApplications';
import type { UseApplicationsOptions } from './useApplications';

/**
 * The mailboxes feature slice.
 *
 * A pass-through, and it used to compose a second one: `useIntegrations`, a stub
 * returning `{}` "to preserve Otter's `useMailboxes → useApplications +
 * useIntegrations` delegation shape". That shape existed because Mail-Meow had
 * integrations to delegate to and then stopped. Spreading an empty object into
 * the return bought nothing and cost a reader a hop to discover there was nothing
 * behind it.
 *
 * Kept as a named export rather than collapsed into `useApplications`, because
 * the import sites read as "the mailboxes feature" and that is worth one line.
 */
export function useMailboxes(options: UseApplicationsOptions) {
  return useApplications(options);
}

export { type UseApplicationsOptions } from './useApplications';
