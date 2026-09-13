export const methodLabels: Record<string, string> = {
  oauth2: 'OAuth2',
  'access-keys': 'Access keys',
};

export const providerLabels: Record<string, string> = {
  'google-gmail': 'Google Gmail',
  'microsoft-outlook': 'Microsoft Outlook',
  'amazon-sns': 'Amazon SNS',
};

export const providerMethod: Record<string, 'oauth2' | 'access-keys'> = {
  'google-gmail': 'oauth2',
  'microsoft-outlook': 'oauth2',
  'amazon-sns': 'access-keys',
};
