import { z } from "zod";
import { apiHandler, requireApiContext } from "@/lib/api";
import {
  createResource,
  listResource,
  resources,
  type ResourceName,
} from "@/lib/services/resources";
import { AppError } from "@/lib/server";

function resourceName(value: string): ResourceName {
  if (!(value in resources)) throw new AppError("NOT_FOUND", "API resource not found");
  return value as ResourceName;
}

export const GET = apiHandler(async (request) => {
  const pathname = new URL(request.url).pathname.split("/").filter(Boolean);
  const name = resourceName(z.string().parse(pathname.at(-1)));
  const context = await requireApiContext(request, resources[name].read);
  return listResource(name, request, context);
});

export const POST = apiHandler(async (request) => {
  const pathname = new URL(request.url).pathname.split("/").filter(Boolean);
  const name = resourceName(z.string().parse(pathname.at(-1)));
  const context = await requireApiContext(request, resources[name].write);
  return createResource(name, request, context);
});
