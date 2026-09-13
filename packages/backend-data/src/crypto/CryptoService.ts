import { decryptData, encryptData } from './aes-gcm';

class CryptoService {
  constructor(private readonly masterKey: string) {}

  public async encrypt(value: string): Promise<{ encrypted: string; iv: string }> {
    return encryptData(value, this.masterKey);
  }

  public async decrypt(encrypted: string, iv: string): Promise<string> {
    return decryptData(encrypted, iv, this.masterKey);
  }
}

export { CryptoService };
