import { z } from "zod";
import { apiHandler, requireApiContext } from "@/lib/api";
import {
  deleteResource,
  getResource,
  resources,
  type ResourceName,
  updateResource,
} from "@/lib/services/resources";
import { AppError } from "@/lib/server";

function segments(request: Request): { name: ResourceName; id: string } {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = z.string().uuid().parse(parts.at(-1));
  const value = z.string().parse(parts.at(-2));
  if (!(value in resources)) throw new AppError("NOT_FOUND", "API resource not found");
  return { name: value as ResourceName, id };
}

export const GET = apiHandler(async (request) => {
  const { name, id } = segments(request);
  const context = await requireApiContext(request, resources[name].read);
  return getResource(name, id, context);
});

export const PATCH = apiHandler(async (request) => {
  const { name, id } = segments(request);
  const context = await requireApiContext(request, resources[name].write);
  return updateResource(name, id, request, context);
});

export const DELETE = apiHandler(async (request) => {
  const { name, id } = segments(request);
  const context = await requireApiContext(request, resources[name].write);
  return deleteResource(name, id, context);
});
