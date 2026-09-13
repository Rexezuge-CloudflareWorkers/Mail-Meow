import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectedApplication, ProviderId } from '../types';
import * as appSvc from '../services/applicationService';

export interface ApplicationFormState {
  applicationId?: string;
  displayName: string;
  providerId: ProviderId;
  clientId: string;
  clientSecret: string;
  accessKeyId: string;
  secretAccessKey: string;
  topicArn: string;
}

export const emptyForm: ApplicationFormState = {
  displayName: '',
  providerId: 'google-gmail',
  clientId: '',
  clientSecret: '',
  accessKeyId: '',
  secretAccessKey: '',
  topicArn: '',
};

interface UseApplicationsOptions {
  setIsBusy: (v: boolean) => void;
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export function useApplications({ setIsBusy, showNotice }: UseApplicationsOptions) {
  const { t } = useTranslation();
  const [applications, setApplications] = useState<ConnectedApplication[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [applicationForm, setApplicationForm] = useState<ApplicationFormState>(emptyForm);

  const selectedApplication = useMemo(
    () => applications.find((a) => a.applicationId === selectedApplicationId),
    [applications, selectedApplicationId],
  );

  const loadApplications = useCallback(async () => {
    const data = await appSvc.listApplications();
    setApplications(data.applications);
    setSelectedApplicationId((c) => c || data.applications[0]?.applicationId || '');
  }, []);

  const resetForm = useCallback(() => {
    setApplicationForm(emptyForm);
  }, []);

  const editApplication = useCallback((application: ConnectedApplication) => {
    setApplicationForm({
      applicationId: application.applicationId,
      displayName: application.displayName,
      providerId: application.providerId,
      clientId: '',
      clientSecret: '',
      accessKeyId: '',
      secretAccessKey: '',
      topicArn: '',
    });
  }, []);

  return {
    applications,
    setApplications,
    selectedApplicationId,
    setSelectedApplicationId,
    selectedApplication,
    applicationForm,
    setApplicationForm,
    loadApplications,
    resetForm,
    editApplication,
    setIsBusy,
    showNotice,
    t,
  };
}

export type { UseApplicationsOptions };
