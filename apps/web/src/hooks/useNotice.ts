import { useCallback, useState } from 'react';

export interface Notice {
  type: 'success' | 'error';
  text: string;
}

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = useCallback((type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 6000);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  return { notice, setNotice, showNotice, clearNotice };
}
