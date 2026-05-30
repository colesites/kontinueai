import type { MiddlewareHandler } from "hono";

const API_KEY = Bun.env.API_KEY;
const ALLOWED_ORIGINS = (Bun.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header("x-api-key");
  const origin = c.req.header("origin");

  if (!apiKey || apiKey !== API_KEY) {
    return c.json({ error: "Invalid or missing API key" }, 403);
  }

  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return c.json({ error: "Origin not allowed" }, 403);
  }

  await next();
};
