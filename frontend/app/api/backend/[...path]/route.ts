import { type NextRequest } from "next/server";
import { publicBackendResponse, privateBackendResponse } from "@/lib/api/backend.server";
import {
  resolveOperation,
  validateOperationQuery,
  validateOperationHeaders,
} from "@/lib/api/operations.server";
import { checkCsrf } from "@/lib/auth/csrf.server";
import { failure, json, readBody } from "@/lib/auth/http.server";
import {
  validateBusinessRequest,
  safeBusinessResponse,
} from "@/lib/api/validation.server";
import { deleteSession } from "@/lib/auth/session.server";
import { ApiError } from "@/lib/api/errors";
import { randomUUID } from "node:crypto";
import { encodeBackendPathSegments } from "@/lib/api/backend-path";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: NextRequest, context: Context) {
  let smartSearchRequest = false;
  let upstreamStarted = false;
  let smartSearchHadJsonContentType = false;
  let diagnosticId: string | undefined;
  try {
    const { path: segments } = await context.params;
    if (
      segments.some(
        (part) => /[\\/\x00-\x20]/.test(part) || part === "." || part === "..",
      )
    )
      return json({ message: "Invalid path" }, 400);
    const path = encodeBackendPathSegments(segments);
    smartSearchRequest =
      request.method === "POST" && path === "/api/v1/recommendations/me/smart";
    diagnosticId = smartSearchRequest ? randomUUID() : undefined;
    smartSearchHadJsonContentType =
      request.headers.get("content-type")?.startsWith("application/json") ?? false;
    if (request.method !== "GET") await checkCsrf(request);
    if (
        request.method === "GET" &&
        (/^\/api\/v1\/payments\/me\/\d+\/verify$/.test(path) ||
            /^\/api\/v1\/property-comparison\/me\/compare-(?:two|multiple)\//.test(path))
    )
      await checkCsrf(request);
    const upstreamMethod =
      request.method === "POST" && /^\/api\/v1\/payments\/me\/\d+\/verify$/.test(path)
        ? "GET"
        : request.method;
    const operation = await resolveOperation(path, upstreamMethod);
    validateOperationQuery(operation.contract, request.nextUrl.searchParams);
    validateOperationHeaders(path, upstreamMethod, request.headers);
    const body =
      request.method === "GET" || !request.headers.get("content-type")
        ? undefined
        : await readBody(request);
    const validated = validateBusinessRequest(operation.path, request.method, body);
    if (smartSearchRequest && process.env.NODE_ENV !== "production") {
      console.info("[smart-search:bff]", {
        stage: "request-validated",
        bodyPresent: validated !== undefined,
        jsonContentType: smartSearchHadJsonContentType,
      });
    }
    const options = {
      method: upstreamMethod,
      body: validated,
      signal: request.signal,
      headers: {
        "Accept-Language": request.headers.get("accept-language")?.startsWith("en")
          ? "en"
          : "ar",
        ...(request.headers.get("idempotency-key")
          ? { "Idempotency-Key": request.headers.get("idempotency-key")! }
          : {}),
      },
      diagnosticId,
    };
    // Query parameters never influence caller identity. Personal routes carry no actor ID; Spring derives identity from the verified Bearer JWT.
    upstreamStarted = true;
    const result = await (
      operation.public ? publicBackendResponse : privateBackendResponse
    )(operation.path + request.nextUrl.search, options);
    const safe = safeBusinessResponse(operation.path, upstreamMethod, result.data);
    if (
      (operation.path === "/api/v1/user/me" && request.method === "DELETE") ||
      (operation.path === "/api/v1/user/me/deactivate" && request.method === "PUT")
    )
      await deleteSession();
    return json(safe, result.status);
  } catch (error) {
    if (smartSearchRequest && process.env.NODE_ENV !== "production") {
      console.warn("[smart-search:bff]", {
        diagnosticId,
        stage: upstreamStarted ? "upstream-request-failed" : "bff-rejected",
        status: error instanceof ApiError ? error.status : 500,
        jsonContentType: smartSearchHadJsonContentType,
        code:
          error instanceof ApiError
            ? (error.backendMessage ?? error.message)
            : "UNEXPECTED_BFF_ERROR",
      });
    }
    return failure(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
