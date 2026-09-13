import { useApplications } from './useApplications';
import type { UseApplicationsOptions } from './useApplications';
import { useIntegrations } from './useIntegrations';

export function useMailboxes(options: UseApplicationsOptions) {
  const applications = useApplications(options);
  const integrations = useIntegrations(options);

  return {
    ...applications,
    ...integrations,
  };
}

export type { UseApplicationsOptions };
