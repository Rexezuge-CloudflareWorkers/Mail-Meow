import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Unauthorized from './components/shared/Unauthorized';
import Header from './components/shared/Header';
import Notice from './components/shared/Notice';
import SpaViewRouter from './components/layout/SpaViewRouter';
import MailboxesView from './components/views/MailboxesView';
import ProcessingView from './components/views/ProcessingView';
import HelpView from './components/views/HelpView';
import { useNotice } from './hooks/useNotice';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useMailboxes } from './hooks/useMailboxes';
import { useApiKeys } from './hooks/useApiKeys';
import { useSpaLanguage } from './hooks/useSpaLanguage';
import type { SpaView } from './types';
import { providerMethod } from './lib/providers';
import * as appSvc from './services/applicationService';

function getInitialNotice(): { type: 'success' | 'error'; text: string } | null {
  const params = new URLSearchParams(globalThis.location.search);
  if (params.get('oauth2') === 'connected') return { type: 'success', text: 'OAuth2 connection completed.' };
  if (params.get('oauth2') === 'error') return { type: 'error', text: params.get('message') || 'OAuth2 connection failed.' };
  return null;
}

export default function SpaApp() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<SpaView>('mailboxes');
  const [isBusy, setIsBusy] = useState(false);
  const { notice, setNotice, showNotice } = useNotice();
  const { user, setUser, authorized, setAuthorized, loadCurrentUser } = useCurrentUser();
  const mailboxes = useMailboxes({ setIsBusy, showNotice });
  const {
    applications, selectedApplicationId, setSelectedApplicationId, selectedApplication,
    applicationForm, setApplicationForm, loadApplications, resetForm, editApplication,
  } = mailboxes;
  const {
    apiKeys, keyName, setKeyName, keyExpiryDays, setKeyExpiryDays,
    createdApiKey, setCreatedApiKey, loadApiKeys,
  } = useApiKeys();
  const { language, languagePending, handleLanguageChange } = useSpaLanguage({ user, showNotice, setUser });

  useEffect(() => {
    const initial = getInitialNotice();
    if (initial) setNotice(initial);
  }, [setNotice]);

  useEffect(() => {
    loadCurrentUser()
      .then(async (me) => {
        if (!me) return;
        try {
          await loadApplications();
        } catch {
          setAuthorized(false);
        }
      })
      .catch(() => undefined);
  }, [loadCurrentUser, loadApplications, setAuthorized]);

  useEffect(() => {
    loadApiKeys(selectedApplicationId).catch((error: unknown) =>
      showNotice('error', error instanceof Error ? error.message : t('notice.loadFailed', 'Load Failed')),
    );
  }, [loadApiKeys, selectedApplicationId, showNotice, t]);

  const saveApplication = useCallback(async () => {
    setIsBusy(true);
    try {
      const connectionMethod = providerMethod[applicationForm.providerId];
      const payload =
        connectionMethod === 'oauth2'
          ? {
              applicationId: applicationForm.applicationId,
              displayName: applicationForm.displayName,
              providerId: applicationForm.providerId,
              connectionMethod,
              clientId: applicationForm.clientId,
              clientSecret: applicationForm.clientSecret,
            }
          : {
              applicationId: applicationForm.applicationId,
              displayName: applicationForm.displayName,
              providerId: applicationForm.providerId,
              connectionMethod,
              accessKeyId: applicationForm.accessKeyId,
              secretAccessKey: applicationForm.secretAccessKey,
              topicArn: applicationForm.topicArn,
            };
      const data = applicationForm.applicationId
        ? await appSvc.updateApplication(payload)
        : await appSvc.createApplication(payload);
      showNotice('success', applicationForm.applicationId ? t('notice.applicationUpdated', 'Application Updated.') : t('notice.applicationCreated', 'Application Created.'));
      resetForm();
      await loadApplications();
      setSelectedApplicationId(data.application.applicationId);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : t('notice.saveFailed', 'Unable To Save Application.'));
    } finally {
      setIsBusy(false);
    }
  }, [applicationForm, loadApplications, resetForm, setSelectedApplicationId, showNotice, t]);

  const deleteApplication = useCallback(
    async (applicationId: string) => {
      setIsBusy(true);
      try {
        await appSvc.deleteApplication(applicationId);
        showNotice('success', t('notice.applicationDeleted', 'Application Deleted.'));
        setSelectedApplicationId('');
        await loadApplications();
      } catch (error) {
        showNotice('error', error instanceof Error ? error.message : t('notice.deleteFailed', 'Unable To Delete Application.'));
      } finally {
        setIsBusy(false);
      }
    },
    [loadApplications, setSelectedApplicationId, showNotice, t],
  );

  const startOAuth2 = useCallback(
    async (applicationId: string) => {
      setIsBusy(true);
      try {
        const data = await appSvc.createOAuth2Authorization(applicationId);
        globalThis.location.assign(data.authorizationUrl);
      } catch (error) {
        showNotice('error', error instanceof Error ? error.message : t('notice.oauthStartFailed', 'Unable To Start OAuth2.'));
        setIsBusy(false);
      }
    },
    [showNotice, t],
  );

  const copyOAuth2RedirectUri = useCallback(
    async (redirectUri?: string) => {
      if (!redirectUri) return;
      try {
        await navigator.clipboard.writeText(redirectUri);
        showNotice('success', t('notice.redirectCopied', 'OAuth2 Redirect URI Copied.'));
      } catch {
        showNotice('error', t('notice.copyFailed', 'Unable To Copy OAuth2 Redirect URI.'));
      }
    },
    [showNotice, t],
  );

  const createApiKey = useCallback(async () => {
    if (!selectedApplicationId) return;
    setIsBusy(true);
    try {
      const data = await appSvc.createApiKey(
        selectedApplicationId,
        keyName,
        keyExpiryDays ? Number(keyExpiryDays) : undefined,
      );
      setCreatedApiKey(data.apiKey);
      setKeyName('');
      setKeyExpiryDays('');
      await loadApiKeys(selectedApplicationId);
      showNotice('success', t('notice.apiKeyCreated', 'API Key Created.'));
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : t('notice.apiKeyCreateFailed', 'Unable To Create API Key.'));
    } finally {
      setIsBusy(false);
    }
  }, [selectedApplicationId, keyName, keyExpiryDays, loadApiKeys, setCreatedApiKey, setKeyExpiryDays, setKeyName, showNotice, t]);

  const deleteApiKey = useCallback(
    async (apiKeyId: string) => {
      if (!selectedApplicationId) return;
      setIsBusy(true);
      try {
        await appSvc.deleteApiKey(selectedApplicationId, apiKeyId);
        await loadApiKeys(selectedApplicationId);
        showNotice('success', t('notice.apiKeyDeleted', 'API Key Deleted.'));
      } catch (error) {
        showNotice('error', error instanceof Error ? error.message : t('notice.apiKeyDeleteFailed', 'Unable To Delete API Key.'));
      } finally {
        setIsBusy(false);
      }
    },
    [selectedApplicationId, loadApiKeys, showNotice, t],
  );



  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[#101319] text-white flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-2 border-[#6ee7b7] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authorized || !user) {
    return <Unauthorized />;
  }

  return (
    <div className="min-h-screen bg-[#101319] text-[#f3f4f6]">
      <Header user={user} view={view} onViewChange={setView} language={language} onLanguageChange={handleLanguageChange} />
      <Notice notice={notice} />
      <SpaViewRouter
        view={view}
        views={{
          mailboxes: (
            <MailboxesView
              user={user}
              applications={applications}
              selectedApplicationId={selectedApplicationId}
              onSelectApplication={setSelectedApplicationId}
              selectedApplication={selectedApplication}
              applicationForm={applicationForm}
              setApplicationForm={setApplicationForm}
              onSaveApplication={saveApplication}
              onResetForm={resetForm}
              onEditApplication={editApplication}
              onDeleteApplication={deleteApplication}
              onStartOAuth2={startOAuth2}
              onCopyRedirectUri={copyOAuth2RedirectUri}
              apiKeys={apiKeys}
              keyName={keyName}
              setKeyName={setKeyName}
              keyExpiryDays={keyExpiryDays}
              setKeyExpiryDays={setKeyExpiryDays}
              createdApiKey={createdApiKey}
              onCreateApiKey={createApiKey}
              onDeleteApiKey={deleteApiKey}
              isBusy={isBusy || languagePending}
              lng={i18n.resolvedLanguage ?? language}
            />
          ),
          processing: <ProcessingView lng={i18n.resolvedLanguage ?? language} />,
          help: <HelpView />,
        }}
      />
    </div>
  );
}
