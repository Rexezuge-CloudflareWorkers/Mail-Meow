import { useCallback, useState } from 'react';
import type { ApplicationApiKey } from '../types';
import * as appSvc from '../services/applicationService';

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApplicationApiKey[]>([]);
  const [keyName, setKeyName] = useState('');
  const [keyExpiryDays, setKeyExpiryDays] = useState('');
  const [createdApiKey, setCreatedApiKey] = useState('');

  const loadApiKeys = useCallback(async (applicationId: string) => {
    if (!applicationId) {
      setApiKeys([]);
      return;
    }
    const data = await appSvc.listApiKeys(applicationId);
    setApiKeys(data.apiKeys);
  }, []);

  return { apiKeys, setApiKeys, keyName, setKeyName, keyExpiryDays, setKeyExpiryDays, createdApiKey, setCreatedApiKey, loadApiKeys };
}
