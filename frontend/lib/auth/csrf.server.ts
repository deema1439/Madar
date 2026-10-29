import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/api/errors";
import { configuredAppOrigin } from "./config.server";
const production = process.env.NODE_ENV === "production";
const name = production ? "__Host-madar-csrf" : "madar-csrf";
export function checkOrigin(request: Request) {
  const expected = configuredAppOrigin() || new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");

  if (!expected || (production && !expected.startsWith("https://"))) {
    throw new ApiError("Forbidden", 403);
  }

  // Browsers may omit Origin on same-origin GET requests.
  if (origin) {
    if (origin !== expected) {
      throw new ApiError("Forbidden", 403);
    }
  } else if (request.method !== "GET") {
    throw new ApiError("Forbidden", 403);
  }

  if (site && site !== "same-origin" && site !== "none") {
    throw new ApiError("Forbidden", 403);
  }
}
export async function issueCsrf() {
  const jar = await cookies();
  let token = jar.get(name)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    jar.set(name, token, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      path: "/",
      maxAge: 3600,
    });
  }
  return token;
}
export async function checkCsrf(request: Request) {
  checkOrigin(request);
  const cookie = (await cookies()).get(name)?.value;
  const header = request.headers.get("x-madar-csrf");
  if (
    !cookie ||
    !header ||
    !/^[a-f0-9]{64}$/.test(cookie) ||
    !/^[a-f0-9]{64}$/.test(header) ||
    !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
  )
    throw new ApiError("Forbidden", 403);
}
