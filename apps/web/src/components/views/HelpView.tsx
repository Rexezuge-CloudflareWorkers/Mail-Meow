import { useTranslation } from 'react-i18next';

export default function HelpView() {
  const { t } = useTranslation();
  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-4">{t('help.title', 'Help')}</h1>
      <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
        <h2 className="text-lg font-semibold mb-2">{t('help.oauthTitle', 'OAuth2 Setup')}</h2>
        <p className="text-sm text-[#aab4c2]">
          {t('help.oauthBody', 'Register the redirect URI with Google or Microsoft, then authorize the application.')}
        </p>
      </div>
    </main>
  );
}
