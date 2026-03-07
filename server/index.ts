import "./dns-prefer-ipv4";
import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startWaiverProcessor } from "./waiver-processor";
import { startBotSimulation } from "./bot-simulation";
import { applySecurityMiddleware } from "./security";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));
applySecurityMiddleware(app);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    // Never reflect raw server error text to clients from the global handler.
    // Route handlers should return explicit client-safe messages for known cases.
    const message = status >= 500 ? "Internal Server Error" : "Request failed";

    res.status(status).json({ message });
    if (status >= 500) {
      console.error("[server] Unhandled error:", err);
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    log(`[startup] BOT_SIMULATION_ENABLED=${process.env.BOT_SIMULATION_ENABLED ?? "<unset>"}`);
    startWaiverProcessor();
    startBotSimulation().catch(err => console.error("[Bot Sim] Startup error:", err));
  });
})();
