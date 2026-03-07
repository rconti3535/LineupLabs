import type { Express, NextFunction, Request, Response } from "express";
import session from "express-session";
import helmet from "helmet";
import cors from "cors";
import createMemoryStore from "memorystore";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const MemoryStore = createMemoryStore(session);

const PUBLIC_API_ROUTES = new Set([
  "POST:/api/users",
  "POST:/api/auth/login",
  "POST:/api/auth/reset-password",
]);

function isPublicApiRoute(req: Request): boolean {
  return PUBLIC_API_ROUTES.has(`${req.method.toUpperCase()}:${req.path}`);
}

function buildAllowedOrigins(): string[] {
  const configured = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const single = [
    process.env.FRONTEND_URL,
    process.env.PUBLIC_APP_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined,
  ].filter((s): s is string => !!s && s.trim().length > 0);

  const defaults =
    process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000", "http://localhost:5000", "http://127.0.0.1:5000"];

  return Array.from(new Set([...configured, ...single, ...defaults]));
}

function createRateLimitMiddleware() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const hasUpstash = !!redisUrl && !!redisToken;

  type RateRule = {
    id: string;
    max: number;
    window: "10 s" | "30 s" | "1 m";
    match: (req: Request) => boolean;
  };

  const rules: RateRule[] = [
    {
      id: "signup",
      max: 8,
      window: "10 s",
      match: (req) => req.method === "POST" && req.path === "/api/users",
    },
    {
      id: "login",
      max: 20,
      window: "1 m",
      match: (req) => req.method === "POST" && req.path === "/api/auth/login",
    },
    {
      id: "league-create",
      max: 4,
      window: "1 m",
      match: (req) => req.method === "POST" && req.path === "/api/leagues",
    },
    {
      id: "league-join",
      max: 20,
      window: "1 m",
      match: (req) => req.method === "POST" && /^\/api\/leagues\/\d+\/join$/.test(req.path),
    },
    {
      id: "news-feed",
      max: 20,
      window: "1 m",
      match: (req) => req.method === "GET" && /^\/api\/news\/[^/]+$/.test(req.path),
    },
    {
      id: "available-players",
      max: 90,
      window: "1 m",
      match: (req) => req.method === "GET" && /^\/api\/leagues\/\d+\/available-players$/.test(req.path),
    },
    {
      id: "standings",
      max: 120,
      window: "1 m",
      match: (req) => req.method === "GET" && /^\/api\/leagues\/\d+\/standings$/.test(req.path),
    },
    {
      id: "draft-picks-read",
      max: 180,
      window: "1 m",
      match: (req) => req.method === "GET" && /^\/api\/leagues\/\d+\/draft-picks$/.test(req.path),
    },
    {
      id: "draft-picks-write",
      max: 25,
      window: "30 s",
      match: (req) => req.method === "POST" && /^\/api\/leagues\/\d+\/draft-picks$/.test(req.path),
    },
    {
      id: "default",
      max: 240,
      window: "1 m",
      match: () => true,
    },
  ];

  const redis = hasUpstash ? new Redis({ url: redisUrl!, token: redisToken! }) : null;
  const upstashLimiters = hasUpstash
    ? new Map<string, Ratelimit>(
        rules.map((rule) => [
          rule.id,
          new Ratelimit({
            redis: redis!,
            limiter: Ratelimit.fixedWindow(rule.max, rule.window),
            analytics: true,
            prefix: `lineuplabs:${rule.id}`,
          }),
        ]),
      )
    : null;

  const fallbackWindowsMs: Record<RateRule["window"], number> = {
    "10 s": 10_000,
    "30 s": 30_000,
    "1 m": 60_000,
  };
  const fallbackHits = new Map<string, { count: number; resetAt: number }>();

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) return next();
    const rule = rules.find((r) => r.match(req)) || rules[rules.length - 1];

    const authUserId = (req.session as any)?.userId;
    const key = `${rule.id}:${authUserId ?? req.ip}`;

    try {
      if (upstashLimiters) {
        const limiter = upstashLimiters.get(rule.id) || upstashLimiters.get("default");
        const result = await limiter!.limit(key);
        if (!result.success) {
          const retryAfterSeconds = result.reset ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) : undefined;
          if (retryAfterSeconds) {
            res.setHeader("Retry-After", String(retryAfterSeconds));
          }
          return res.status(429).json({
            message: "Too many requests. Please try again shortly.",
            retryAfterSeconds,
          });
        }
        res.setHeader("X-RateLimit-Limit", String(result.limit));
        res.setHeader("X-RateLimit-Remaining", String(result.remaining));
        return next();
      }

      const now = Date.now();
      const existing = fallbackHits.get(key);
      if (!existing || existing.resetAt <= now) {
        fallbackHits.set(key, { count: 1, resetAt: now + fallbackWindowsMs[rule.window] });
        return next();
      }
      existing.count += 1;
      if (existing.count > rule.max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          message: "Too many requests. Please try again shortly.",
          retryAfterSeconds,
        });
      }
      return next();
    } catch {
      // Fails open to avoid taking down the API due limiter issues.
      return next();
    }
  };
}

export function applySecurityMiddleware(app: Express) {
  app.set("trust proxy", 1);

  app.use(
    helmet({
      xPoweredBy: false,
      frameguard: { action: "deny" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          // Allow Google Fonts stylesheet used by the client entry HTML.
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:", "wss:"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: "no-referrer" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  const allowedOrigins = buildAllowedOrigins();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("CORS origin not allowed"));
      },
      credentials: true,
    }),
  );

  app.use(
    session({
      name: "lineuplabs.sid",
      secret: process.env.SESSION_SECRET || "dev-only-session-secret-change-me",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({
        checkPeriod: 24 * 60 * 60 * 1000,
      }),
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );

  app.use(createRateLimitMiddleware());

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    if (req.method.toUpperCase() === "OPTIONS") return next();
    if (isPublicApiRoute(req)) return next();

    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    return next();
  });
}

