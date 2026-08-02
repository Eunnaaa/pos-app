import { errorResponse } from "@/lib/server";

export type ApiHandler = (request: Request) => Promise<Response>;

export function apiHandler(handler: ApiHandler): ApiHandler {
  return async (request) => {
    const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
    try {
      const response = await handler(request);
      response.headers.set("x-request-id", requestId);
      response.headers.set("cache-control", "no-store");
      return response;
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}
