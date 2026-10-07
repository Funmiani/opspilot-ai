import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

export const runtime = "nodejs";
const handlers = toNextJsHandler(async (request: Request) => (await getAuth()).handler(request));
export const GET = handlers.GET;
export const POST = handlers.POST;
