import { useCallback, useState } from 'react';
import { NOTICE_TIMEOUT_MS } from '../lib/constants';

export interface Notice {
  type: 'success' | 'error';
  text: string;
}

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = useCallback((type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  return { notice, setNotice, showNotice, clearNotice };
}
