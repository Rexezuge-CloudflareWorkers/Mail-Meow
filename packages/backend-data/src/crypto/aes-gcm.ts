function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.codePointAt(0) ?? 0);
}

export async function encryptData(data: string, keyBase64: string, ivBase64?: string): Promise<{ encrypted: string; iv: string }> {
  const key = await crypto.subtle.importKey('raw', fromBase64(keyBase64), { name: 'AES-GCM' }, false, ['encrypt']);

  // 96-bit random IV: the GCM-recommended size, fresh per encryption.
  const iv = ivBase64 ? fromBase64(ivBase64) : crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    encrypted: btoa(String.fromCodePoint(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCodePoint(...iv)),
  };
}

export async function decryptData(encryptedBase64: string, ivBase64: string, keyBase64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', fromBase64(keyBase64), { name: 'AES-GCM' }, false, ['decrypt']);

  const iv = fromBase64(ivBase64);
  const encrypted = fromBase64(encryptedBase64);

  // Throws OperationError when the key, IV, or ciphertext does not authenticate.
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}
