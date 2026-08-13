import { errorResponse } from "@/lib/server";
import { logger } from "@/lib/server/logger";

export type ApiHandler = (request: Request) => Promise<Response>;

export function apiHandler(handler: ApiHandler): ApiHandler {
  return async (request) => {
    const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
    const url = new URL(request.url);
    logger.debug("api request", {
      requestId,
      method: request.method,
      path: url.pathname,
    });
    try {
      const response = await handler(request);
      response.headers.set("x-request-id", requestId);
      response.headers.set("cache-control", "no-store");
      if (response.status >= 500) {
        logger.error("api server error response", { requestId, method: request.method, path: url.pathname, status: response.status });
      } else if (response.status >= 400) {
        logger.warn("api client error response", { requestId, method: request.method, path: url.pathname, status: response.status });
      }
      return response;
    } catch (error) {
      logger.error("api unhandled error", { requestId, method: request.method, path: url.pathname }, error);
      return errorResponse(error, requestId);
    }
  };
}
