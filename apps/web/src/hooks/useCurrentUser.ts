import { useCallback, useState } from 'react';
import type { CurrentUser } from '../types';
import { getCurrentUser } from '../services/userService';

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const loadCurrentUser = useCallback(async () => {
    try {
      const me = await getCurrentUser();
      setUser(me);
      setAuthorized(true);
      return me;
    } catch {
      setAuthorized(false);
      return null;
    }
  }, []);

  return { user, setUser, authorized, setAuthorized, loadCurrentUser };
}
