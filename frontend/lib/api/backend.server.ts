import "server-only";
import { ApiError } from "./errors";
import { backendBaseUrl } from "./config.server";
import { backendFailure } from "./backend-error-catalog";
import { requireSession } from "@/lib/auth/session.server";
export type BackendOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  diagnosticId?: string;
};
export type BackendResponse = {
  data: unknown;
  status: number;
};


function getBackendTimeout(path: string): number {
  if (
      path.startsWith("/api/v1/ai/") ||
      path.split("?")[0] === "/api/v1/recommendations/me/smart"
  ) {
    return 180_000;
  }

  return 60_000;
}


export async function publicBackendResponse(
  path: string,
  options: BackendOptions = {},
  token?: string,
): Promise<BackendResponse> {
  const smartSearchRequest = path.split("?")[0] === "/api/v1/recommendations/me/smart";
  const diagnostic = (event: string, details: Record<string, string | number>) => {
    if (smartSearchRequest && process.env.NODE_ENV !== "production") {
      console.info(`[smart-search:${event}]`, {
        diagnosticId: options.diagnosticId ?? "unavailable",
        ...details,
      });
    }
  };
  if (
    !path.startsWith("/api/v1/") ||
    /[\\#]/.test(path) ||
    path
      .split("?")[0]
      .split("/")
      .some((part) => part === "." || part === "..")
  )
    throw new ApiError("Invalid backend path", 400);
  const base = backendBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method || "GET",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...options.headers,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(getBackendTimeout(path))])
        : AbortSignal.timeout(getBackendTimeout(path)),
    });
  } catch (error) {
    diagnostic("backend-transport-failed", {
      status: error instanceof Error && error.name === "TimeoutError" ? 504 : 503,
      code:
        error instanceof Error && error.name === "TimeoutError"
          ? "TIMEOUT"
          : "UNAVAILABLE",
    });
    throw new ApiError(
      "Backend unavailable",
      error instanceof Error && error.name === "TimeoutError" ? 504 : 503,
    );
  }
  let data: unknown;
  try {
    data = response.status === 204 ? null : await response.json();
  } catch {
    if (response.ok) {
      diagnostic("invalid-backend-json", { status: 502, code: "INVALID_JSON" });
      throw new ApiError("Invalid backend response", 502);
    }
  }
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "";
    const failure = backendFailure(response.status, message);
    diagnostic("backend-response", {
      status: failure.status,
      code: failure.backendMessage ?? "UNCLASSIFIED_BACKEND_ERROR",
    });
    throw new ApiError("Backend request failed", failure.status, failure.backendMessage);
  }
  diagnostic("backend-response", { status: response.status, code: "SUCCESS" });
  return { data, status: response.status };
}

export async function publicBackend(
  path: string,
  options: BackendOptions = {},
  token?: string,
): Promise<unknown> {
  return (await publicBackendResponse(path, options, token)).data;
}
export async function privateBackend(path: string, options: BackendOptions = {}) {
  const session = await requireSession();
  // Route Handler error boundaries clear the cookie on 401; 403 keeps it intact.
  return publicBackend(path, options, session.accessToken);
}

export async function privateBackendResponse(
  path: string,
  options: BackendOptions = {},
): Promise<BackendResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (error) {
    if (
      path.split("?")[0] === "/api/v1/recommendations/me/smart" &&
      process.env.NODE_ENV !== "production"
    ) {
      console.warn("[smart-search:bff-auth-rejected]", {
        diagnosticId: options.diagnosticId ?? "unavailable",
        status: error instanceof ApiError ? error.status : 500,
        code: error instanceof ApiError ? error.message : "UNEXPECTED_AUTH_ERROR",
      });
    }
    throw error;
  }
  return publicBackendResponse(path, options, session.accessToken);
}
