import { useTranslation } from 'react-i18next';

export default function Unauthorized() {
  const { t } = useTranslation();
  const authenticateWithZeroTrust = () => {
    window.location.assign('/user/');
  };

  return (
    <div className="min-h-screen bg-[#101319] text-white flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-2xl font-semibold mb-2">{t('app.unauthorizedTitle', 'Unauthorized')}</h1>
        <p className="text-[#aab4c2]">{t('app.unauthorizedBody', 'Sign in with Cloudflare Access to manage applications.')}</p>
        <button
          type="button"
          onClick={authenticateWithZeroTrust}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-[#0f766e] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0d9488] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6ee7b7]"
        >
          Authenticate with Cloudflare Zero Trust
        </button>
      </div>
    </div>
  );
}
