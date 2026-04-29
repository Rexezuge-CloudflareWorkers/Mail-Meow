import { UnauthorizedError } from '@/error';

class EmailValidationUtil {
  public static getAuthenticatedUserEmail(request: Request, env: Env): string {
    const devEmail: string | undefined = env.DEV_AUTH_EMAIL;
    if (devEmail) {
      return devEmail;
    }

    const userEmail: string | null = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (userEmail) {
      return userEmail;
    }

    throw new UnauthorizedError('No authenticated user email provided by Cloudflare Access.');
  }
}

export { EmailValidationUtil };
