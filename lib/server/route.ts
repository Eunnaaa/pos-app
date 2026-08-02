import "server-only";
import { errorResponse } from "./errors";
import { createRequestContext } from "./request-context";

export type RouteHandler = (request: Request, context: ReturnType<typeof createRequestContext>) => Promise<Response>;

export function withRoute(handler: RouteHandler) {
  return async (request: Request): Promise<Response> => {
    let requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
    try {
      const context = createRequestContext(request);
      requestId = context.requestId;
      const response = await handler(request, context);
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}
