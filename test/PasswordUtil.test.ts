import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '@/utils/PasswordUtil';

describe('PasswordUtil', () => {
  it('should hash password correctly', async () => {
    const password = 'testpassword123';
    const hash = await hashPassword(password);
    
    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(0);
  });

  it('should compare password correctly', async () => {
    const password = 'testpassword123';
    const hash = await hashPassword(password);
    
    const isValid = await comparePassword(password, hash);
    const isInvalid = await comparePassword('wrongpassword', hash);
    
    expect(isValid).toBe(true);
    expect(isInvalid).toBe(false);
  });
});
