/**
 * Generate a unique API Key
 * @returns {string} API Key
 */
export function generateApiKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
