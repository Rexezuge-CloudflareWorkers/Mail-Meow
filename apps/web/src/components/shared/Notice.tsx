import { useTranslation } from 'react-i18next';

export interface NoticeData {
  type: 'success' | 'error';
  text: string;
}

interface NoticeProps {
  notice: NoticeData | null;
  onDismiss?: () => void;
}

/**
 * Transient status message with a dismiss control.
 *
 * The `role`/`aria-live` pair is what makes the notice reach assistive tech at
 * all: a plain `div` is announced by nothing, so both successes and — worse —
 * errors were silently dropped for screen-reader users. `role="alert"` implies
 * `aria-live="assertive"`, which interrupts; that suits an error and not a
 * routine success, so the two are distinguished.
 */
export default function Notice({ notice, onDismiss }: NoticeProps) {
  const { t } = useTranslation();
  if (!notice) return null;

  const isError = notice.type === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-down flex items-center gap-3 px-5 py-3 rounded-md shadow-xl bg-[#1a1f29] border border-[#374151]"
    >
      <span className={isError ? 'text-[#fca5a5]' : 'text-[#6ee7b7]'}>{notice.text}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          // The notice vanishes on a timer; a keyboard or screen-reader user must
          // not have to wait for it.
          aria-label={t('notice.dismiss', 'Dismiss')}
          className="text-[#aab4c2] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6ee7b7] rounded"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
