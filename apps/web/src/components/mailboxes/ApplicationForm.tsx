import { useTranslation } from 'react-i18next';
import type { ApplicationFormState } from '../../hooks/useApplications';
import type { ProviderId } from '../../types';
import { providerMethod } from '../../lib/providers';

interface ApplicationFormProps {
  form: ApplicationFormState;
  setForm: (form: ApplicationFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}

export const emptyFormExport = undefined;

export default function ApplicationForm({ form, setForm, onSave, onCancel, busy }: ApplicationFormProps) {
  const { t } = useTranslation();
  const method = providerMethod[form.providerId];
  const update = (changes: Partial<ApplicationFormState>) => setForm({ ...form, ...changes });

  return (
    <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
      <h2 className="text-lg font-semibold mb-4">
        {form.applicationId ? t('mailboxes.editApplication', 'Edit Application') : t('mailboxes.newApplication', 'New Application')}
      </h2>
      <div className="space-y-3">
        <input
          value={form.displayName}
          onChange={(event) => update({ displayName: event.target.value })}
          placeholder={t('mailboxes.displayName', 'Display Name')}
          className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
        />
        <select
          value={form.providerId}
          onChange={(event) => update({ providerId: event.target.value as ProviderId })}
          disabled={Boolean(form.applicationId)}
          className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white disabled:opacity-60"
        >
          <option value="google-gmail">Google Gmail / OAuth2</option>
          <option value="microsoft-outlook">Microsoft Outlook / OAuth2</option>
          <option value="amazon-sns">Amazon SNS / Access keys</option>
        </select>

        {method === 'oauth2' ? (
          <>
            <input
              value={form.clientId}
              onChange={(event) => update({ clientId: event.target.value })}
              placeholder={t('mailboxes.oauth2ClientId', 'OAuth2 Client ID')}
              className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
            />
            <input
              value={form.clientSecret}
              onChange={(event) => update({ clientSecret: event.target.value })}
              placeholder={t('mailboxes.oauth2ClientSecret', 'OAuth2 Client Secret')}
              type="password"
              className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
            />
          </>
        ) : (
          <>
            <input
              value={form.accessKeyId}
              onChange={(event) => update({ accessKeyId: event.target.value })}
              placeholder={t('mailboxes.awsAccessKeyId', 'AWS Access Key ID')}
              className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
            />
            <input
              value={form.secretAccessKey}
              onChange={(event) => update({ secretAccessKey: event.target.value })}
              placeholder={t('mailboxes.awsSecretAccessKey', 'AWS Secret Access Key')}
              type="password"
              className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
            />
            <input
              value={form.topicArn}
              onChange={(event) => update({ topicArn: event.target.value })}
              placeholder={t('mailboxes.snsTopicArn', 'SNS Topic ARN')}
              className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
            />
          </>
        )}
        <div className="flex gap-2">
          <button
            className="flex-1 px-4 py-2 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50"
            onClick={onSave}
            disabled={busy}
          >
            {t('mailboxes.save', 'Save Application')}
          </button>
          <button className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]" onClick={onCancel} disabled={busy}>
            {t('mailboxes.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
