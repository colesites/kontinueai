import type { MiddlewareHandler } from "hono";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const MAX_REQUESTS = 20;
const WINDOW_MS = 60 * 1000;

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  const now = Date.now();

  let entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    rateLimitMap.set(ip, entry);
  } else {
    entry.count++;
  }

  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

  c.header("X-RateLimit-Limit", String(MAX_REQUESTS));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(entry.resetAt));

  if (entry.count > MAX_REQUESTS) {
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Rate limit exceeded", retryAfter }, 429);
  }

  await next();
};
