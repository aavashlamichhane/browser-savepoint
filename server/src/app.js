import cors from "cors";
import express from "express";
import helmet from "helmet";
import { requireAuth } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rate-limit.js";

const isBase64 = (value) => typeof value === "string" && /^[A-Za-z0-9+/=]+$/.test(value);

export const createApp = ({ authService, saveRepo, storageState }) => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "20mb" }));
  app.use(rateLimit());

  app.get("/api/v1/health", (_req, res) => {
    res.json({ ok: true, status: "healthy", storage: storageState.dataDir });
  });

  app.get("/api/v1/auth/config", (_req, res) => {
    const config = authService.getAuthConfig();
    res.json({ ok: true, ...config });
  });

  app.post("/api/v1/auth/setup", async (req, res) => {
    const { authSaltB64, authIterations, authVerifierB64, trustedRecoveryEnabled } = req.body ?? {};
    if (!isBase64(authSaltB64) || !isBase64(authVerifierB64) || !Number.isInteger(authIterations)) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid setup payload." });
      return;
    }

    const out = await authService.setup({
      authSaltB64,
      authIterations,
      authVerifierB64,
      trustedRecoveryEnabled
    });
    res.status(out.ok ? 200 : 409).json(out);
  });

  app.post("/api/v1/auth/login", async (req, res) => {
    const { authVerifierB64 } = req.body ?? {};
    if (!isBase64(authVerifierB64)) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid login payload." });
      return;
    }
    const out = await authService.login({ authVerifierB64 });
    res.status(out.ok ? 200 : 401).json(out);
  });

  app.post("/api/v1/auth/refresh", async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== "string" || !refreshToken) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid refresh payload." });
      return;
    }
    const out = await authService.refresh({ refreshToken });
    res.status(out.ok ? 200 : 401).json(out);
  });

  app.post("/api/v1/auth/logout", async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== "string" || !refreshToken) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid logout payload." });
      return;
    }
    const out = await authService.logout({ refreshToken });
    res.status(200).json(out);
  });

  app.get("/api/v1/saves", requireAuth(authService), (_req, res) => {
    const saves = saveRepo.listSaves().map((item) => ({
      id: item.id,
      filename: item.filename,
      sizeBytes: item.sizeBytes,
      createdAt: item.createdAt,
      ciphertextMeta: item.ciphertextMeta ?? {}
    }));
    res.json({ ok: true, saves });
  });

  app.post("/api/v1/saves", requireAuth(authService), async (req, res) => {
    const { filename, encryptedBase64, ciphertextMeta } = req.body ?? {};
    if (
      typeof filename !== "string" ||
      !filename.toLowerCase().endsWith(".bsave") ||
      !isBase64(encryptedBase64)
    ) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid save payload." });
      return;
    }

    const save = await saveRepo.createSave({ filename, encryptedBase64, ciphertextMeta });
    res.status(201).json({
      ok: true,
      save: {
        id: save.id,
        filename: save.filename,
        sizeBytes: save.sizeBytes,
        createdAt: save.createdAt
      }
    });
  });

  app.get("/api/v1/saves/:id", requireAuth(authService), async (req, res) => {
    const out = await saveRepo.getSaveBlobBase64(req.params.id);
    if (!out) {
      res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Save not found." });
      return;
    }
    res.json({
      ok: true,
      save: {
        id: out.save.id,
        filename: out.save.filename,
        sizeBytes: out.save.sizeBytes,
        createdAt: out.save.createdAt
      },
      encryptedBase64: out.encryptedBase64
    });
  });

  app.delete("/api/v1/saves/:id", requireAuth(authService), async (req, res) => {
    const deleted = await saveRepo.deleteSave(req.params.id);
    if (!deleted) {
      res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Save not found." });
      return;
    }
    res.json({ ok: true });
  });

  app.use((_req, res) => {
    res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Route not found." });
  });

  app.use((error, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error("[savepoint-server] unhandled error:", error);
    res.status(500).json({ ok: false, code: "SERVER_ERROR", message: "Internal server error." });
  });

  return app;
};
