import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { validateDeploymentConfig } from "./deploymentConfig";
import { getRuntimeHealth } from "./runtimeHealth";
import { startNgrokTunnel, stopNgrokTunnel } from "./ngrok";
import { serveStatic, setupVite } from "./vite";

async function listenOnAvailablePort(
  server: ReturnType<typeof createServer>,
  host: string,
  startPort: number
): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    const result = await new Promise<"listening" | "busy" | Error>(resolve => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off("listening", onListening);
        resolve(error.code === "EADDRINUSE" ? "busy" : error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve("listening");
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });

    if (result === "listening") return port;
    if (result !== "busy") throw result;
    console.log(`Port ${port} is busy, trying ${port + 1}`);
  }

  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateDeploymentConfig();

  const app = express();
  const server = createServer(app);
  const bodyLimit = process.env.REQUEST_BODY_LIMIT || "5mb";

  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ limit: bodyLimit, extended: true }));
  app.get("/api/health", (_req, res) => {
    res.json(getRuntimeHealth());
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Vite is only used when explicitly requested for frontend development.
  // Normal local, ngrok, and packaged app runs serve the built static files.
  if (process.env.NODE_ENV === "development" && process.env.USE_VITE_DEV_SERVER === "true") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPortRaw = process.env.PORT ?? "3000";
  const preferredPort = Number.parseInt(preferredPortRaw, 10);
  if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
    throw new Error(`Invalid PORT value: ${preferredPortRaw}`);
  }

  const host = process.env.HOST || "127.0.0.1";
  const port = await listenOnAvailablePort(server, host, preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  console.log(`Server running on http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`);
  startNgrokTunnel(port).catch(error => {
    console.error("[ngrok] Failed to start ngrok tunnel:", error);
  });

  const shutdownNgrok = async () => {
    try {
      await stopNgrokTunnel();
    } catch (error) {
      console.error("[ngrok] Failed to stop tunnel cleanly:", error);
    }
  };

  const runOnShutdown = (signalName: string) => {
    process.once(signalName, () => {
      void shutdownNgrok();
    });
  };
  runOnShutdown("SIGINT");
  runOnShutdown("SIGTERM");
}

startServer().catch(console.error);
