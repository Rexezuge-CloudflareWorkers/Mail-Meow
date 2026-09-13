import { useTranslation } from 'react-i18next';
import type { ApplicationApiKey, ConnectedApplication, CurrentUser } from '../../types';
import type { ApplicationFormState } from '../../hooks/useApplications';
import { methodLabels, providerLabels } from '../../lib/providers';
import { formatExpiryTimestamp, formatTimestamp } from '../../lib/format';
import ApplicationForm from '../mailboxes/ApplicationForm';
import StatusBadge from '../shared/StatusBadge';

interface MailboxesViewProps {
  user: CurrentUser;
  applications: ConnectedApplication[];
  selectedApplicationId: string;
  onSelectApplication: (id: string) => void;
  selectedApplication?: ConnectedApplication;
  applicationForm: ApplicationFormState;
  setApplicationForm: (form: ApplicationFormState) => void;
  onSaveApplication: () => void;
  onResetForm: () => void;
  onEditApplication: (app: ConnectedApplication) => void;
  onDeleteApplication: (id: string) => void;
  onStartOAuth2: (id: string) => void;
  onCopyRedirectUri: (uri?: string) => void;
  apiKeys: ApplicationApiKey[];
  keyName: string;
  setKeyName: (v: string) => void;
  keyExpiryDays: string;
  setKeyExpiryDays: (v: string) => void;
  createdApiKey: string;
  onCreateApiKey: () => void;
  onDeleteApiKey: (id: string) => void;
  isBusy: boolean;
  lng: string;
}

export default function MailboxesView(props: MailboxesViewProps) {
  const { t } = useTranslation();
  const {
    user, applications, selectedApplicationId, onSelectApplication, selectedApplication,
    applicationForm, setApplicationForm, onSaveApplication, onResetForm, onEditApplication,
    onDeleteApplication, onStartOAuth2, onCopyRedirectUri,
    apiKeys, keyName, setKeyName, keyExpiryDays, setKeyExpiryDays, createdApiKey,
    onCreateApiKey, onDeleteApiKey, isBusy, lng,
  } = props;

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{t('mailboxes.title', 'Connected Applications')}</h1>
          <span className="text-sm text-[#aab4c2]">
            {applications.length}/{user.limits.maxApplicationsPerUser}
          </span>
        </div>

        <div className="space-y-3">
          {applications.map((application) => (
            <button
              key={application.applicationId}
              onClick={() => onSelectApplication(application.applicationId)}
              className={`w-full text-left p-4 rounded-md border transition ${
                selectedApplicationId === application.applicationId
                  ? 'border-[#6ee7b7] bg-[#17221f]'
                  : 'border-[#2d3745] bg-[#171c25] hover:border-[#526073]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-white">{application.displayName}</div>
                  <div className="text-sm text-[#aab4c2]">
                    {providerLabels[application.providerId]} / {methodLabels[application.connectionMethod]}
                  </div>
                </div>
                <StatusBadge status={application.status} />
              </div>
            </button>
          ))}
          {applications.length === 0 && (
            <div className="p-5 rounded-md border border-[#2d3745] bg-[#171c25] text-[#aab4c2]">
              {t('mailboxes.empty', 'No Connected Applications Yet')}
            </div>
          )}
        </div>

        <ApplicationForm form={applicationForm} setForm={setApplicationForm} onSave={onSaveApplication} onCancel={onResetForm} busy={isBusy} />
      </section>

      <section className="space-y-6">
        {selectedApplication ? (
          <>
            <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-semibold">{selectedApplication.displayName}</h2>
                    <StatusBadge status={selectedApplication.status} />
                  </div>
                  <div className="text-sm text-[#aab4c2]">
                    {providerLabels[selectedApplication.providerId]} / {methodLabels[selectedApplication.connectionMethod]}
                  </div>
                  <div className="text-xs text-[#7d8896] mt-2">{formatTimestamp(selectedApplication.updatedAt, lng)}</div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]" onClick={() => onEditApplication(selectedApplication)}>
                    {t('mailboxes.edit', 'Edit')}
                  </button>
                  <button
                    className="px-3 py-2 rounded-md bg-[#3a1f23] text-[#fecaca] hover:bg-[#4d272d]"
                    onClick={() => onDeleteApplication(selectedApplication.applicationId)}
                    disabled={isBusy}
                  >
                    {t('mailboxes.delete', 'Delete')}
                  </button>
                </div>
              </div>

              {selectedApplication.connectionMethod === 'oauth2' && (
                <div className="mt-5 rounded-md border border-[#334155] bg-[#11161f] p-4">
                  <div className="text-sm text-[#aab4c2] mb-2">OAuth2 redirect URI</div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <input
                      readOnly
                      value={selectedApplication.oauth2RedirectUri ?? ''}
                      className="flex-1 min-w-0 px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-[#d1d5db]"
                    />
                    <button
                      type="button"
                      aria-label={t('mailboxes.copyRedirectUri', 'Copy OAuth2 Redirect URI')}
                      className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655] disabled:opacity-50"
                      onClick={() => onCopyRedirectUri(selectedApplication.oauth2RedirectUri)}
                      disabled={!selectedApplication.oauth2RedirectUri}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-md bg-[#0f766e] hover:bg-[#0d9488] disabled:opacity-50"
                      onClick={() => onStartOAuth2(selectedApplication.applicationId)}
                      disabled={isBusy}
                    >
                      Start OAuth2
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-semibold">{t('apiKeys.title', 'API Keys')}</h2>
                  <p className="text-sm text-[#aab4c2] mt-1">
                    {apiKeys.length}/{user.limits.maxApiKeysPerApplication} for this application
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[180px_130px_auto] gap-2">
                  <input
                    value={keyName}
                    onChange={(event) => setKeyName(event.target.value)}
                    placeholder={t('apiKeys.keyName', 'Key Name')}
                    className="px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
                  />
                  <input
                    value={keyExpiryDays}
                    onChange={(event) => setKeyExpiryDays(event.target.value)}
                    placeholder={`${user.limits.defaultApiKeyExpiryDays} days`}
                    inputMode="numeric"
                    className="px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
                  />
                  <button
                    className="px-4 py-2 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50"
                    onClick={onCreateApiKey}
                    disabled={isBusy || !keyName || selectedApplication.status !== 'connected'}
                  >
                    Create
                  </button>
                </div>
              </div>

              {createdApiKey && (
                <div className="mb-4 rounded-md border border-[#6ee7b7] bg-[#10231f] p-4">
                  <div className="text-sm text-[#6ee7b7] mb-2">New API key</div>
                  <input readOnly value={createdApiKey} className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white" />
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[#aab4c2]">
                    <tr className="border-b border-[#2d3745]">
                      <th className="text-left font-medium py-3 pr-4">Name</th>
                      <th className="text-left font-medium py-3 pr-4">Key</th>
                      <th className="text-left font-medium py-3 pr-4">Expires</th>
                      <th className="text-left font-medium py-3 pr-4">Last used</th>
                      <th className="text-right font-medium py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((apiKey) => (
                      <tr key={apiKey.apiKeyId} className="border-b border-[#242b36]">
                        <td className="py-3 pr-4">{apiKey.name}</td>
                        <td className="py-3 pr-4 text-[#aab4c2]">
                          {apiKey.keyPrefix}...{apiKey.keyLastFour}
                        </td>
                        <td className="py-3 pr-4 text-[#aab4c2]">{formatExpiryTimestamp(apiKey.expiresAt, lng)}</td>
                        <td className="py-3 pr-4 text-[#aab4c2]">{formatTimestamp(apiKey.lastUsedAt, lng)}</td>
                        <td className="py-3 text-right">
                          <button className="text-[#fca5a5] hover:text-[#fecaca]" onClick={() => onDeleteApiKey(apiKey.apiKeyId)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {apiKeys.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#aab4c2]">
                          {t('apiKeys.empty', 'No API Keys Yet')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-8 text-center text-[#aab4c2]">
            Select or create an application.
          </div>
        )}
      </section>
    </main>
  );
}
