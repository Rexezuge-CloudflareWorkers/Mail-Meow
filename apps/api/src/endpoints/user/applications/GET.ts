import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { ApplicationResponseUtil } from '@mail-meow/backend-services/application';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata } from '@mail-meow/shared/model';

class ListApplicationsRoute extends IUserRoute<ListApplicationsRequest, ListApplicationsResponse> {
  schema = {
    tags: ['Applications'],
    summary: 'List connected applications',
    description:
      'Returns all connected applications owned by the authenticated user. Each entry includes provider, connection method, status, and the computed oauth2RedirectUri that must be registered with the OAuth2 provider (Google/Microsoft) before completing authorization.',
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(request: ListApplicationsRequest, env: Env, cxt: RouteContext): Promise<ListApplicationsResponse> {
    const scope = createRequestScope(env);
    const applications: ConnectedApplicationMetadata[] = await scope.applications.listApplications(this.getAuthenticatedAccount(cxt));
    return {
      applications: applications.map((application: ConnectedApplicationMetadata) =>
        ApplicationResponseUtil.withRedirectUri(application, request.raw),
      ),
    };
  }
}

type ListApplicationsRequest = IRequest;

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface ListApplicationsResponse extends IResponse {
  applications: ApplicationResponse[];
}

export { ListApplicationsRoute };
