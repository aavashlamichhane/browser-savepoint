import cors from "cors";
import express from "express";
import helmet from "helmet";
import { requireAuth } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rate-limit.js";

const isBase64 = (value) => typeof value === "string" && /^[A-Za-z0-9+/=]+$/.test(value);
const FILE_MIME = "application/x-encrypted-tab-session";
const MAX_FILENAME_LENGTH = 160;

const isValidSaveFilename = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_FILENAME_LENGTH &&
  value.toLowerCase().endsWith(".bsave");

export const createApp = ({ authService, saveRepo, storageState }) => {
  const app = express();
  if (storageState.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "20mb" }));
  app.use(rateLimit());

  app.get("/api/v1/health", (_req, res) => {
    res.json({
      ok: true,
      status: "healthy",
      storage: storageState.dataDir,
      r2Configured: Boolean(storageState.r2Configured)
    });
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

  app.get("/api/v1/saves", requireAuth(authService), async (_req, res) => {
    const saves = (await saveRepo.listSaves()).map((item) => ({
      id: item.id,
      filename: item.filename,
      backend: item.backend ?? "disk",
      sizeBytes: item.sizeBytes,
      createdAt: item.createdAt,
      ciphertextMeta: item.ciphertextMeta ?? {}
    }));
    res.json({ ok: true, saves });
  });

  app.post("/api/v1/saves", requireAuth(authService), async (req, res) => {
    const { filename, encryptedBase64, ciphertextMeta } = req.body ?? {};
    if (!isValidSaveFilename(filename) || !isBase64(encryptedBase64)) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid save payload." });
      return;
    }

    const save = await saveRepo.createSave({ filename, encryptedBase64, ciphertextMeta });
    res.status(201).json({
      ok: true,
      save: {
        id: save.id,
        filename: save.filename,
        backend: save.backend ?? "disk",
        sizeBytes: save.sizeBytes,
        createdAt: save.createdAt
      }
    });
  });

  app.post("/api/v1/saves/presign-upload", requireAuth(authService), async (req, res) => {
    const { filename, sizeBytes, ciphertextMeta, contentType } = req.body ?? {};
    if (!isValidSaveFilename(filename) || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid presign payload." });
      return;
    }
    if (contentType != null && contentType !== FILE_MIME) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Unsupported content type." });
      return;
    }
    try {
      const { save, upload } = await saveRepo.createR2SaveAndGetUploadDescriptor({
        filename,
        sizeBytes,
        ciphertextMeta,
        contentType: contentType || FILE_MIME
      });
      res.status(201).json({
        ok: true,
        save: {
          id: save.id,
          filename: save.filename,
          backend: save.backend,
          sizeBytes: save.sizeBytes,
          createdAt: save.createdAt
        },
        upload
      });
    } catch (error) {
      const statusCode = error?.code === "R2_NOT_CONFIGURED" ? 400 : error?.code === "VALIDATION_ERROR" ? 400 : 500;
      res.status(statusCode).json({
        ok: false,
        code: error?.code ?? "SERVER_ERROR",
        message: error?.message ?? "Could not prepare R2 upload."
      });
    }
  });

  app.get("/api/v1/saves/:id", requireAuth(authService), async (req, res) => {
    let out = null;
    try {
      out = await saveRepo.getSaveBlobBase64(req.params.id);
    } catch (error) {
      if (error?.code === "UNSUPPORTED_BACKEND") {
        res.status(409).json({
          ok: false,
          code: "UNSUPPORTED_BACKEND",
          message: "Use presigned download for cloud-backed save."
        });
        return;
      }
      throw error;
    }
    if (!out) {
      res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Save not found." });
      return;
    }
    res.json({
      ok: true,
      save: {
        id: out.save.id,
        filename: out.save.filename,
        backend: out.save.backend ?? "disk",
        sizeBytes: out.save.sizeBytes,
        createdAt: out.save.createdAt
      },
      encryptedBase64: out.encryptedBase64
    });
  });

  app.post("/api/v1/saves/:id/presign-download", requireAuth(authService), async (req, res) => {
    try {
      const out = await saveRepo.getSaveDownloadDescriptor(req.params.id);
      if (!out) {
        res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Save not found." });
        return;
      }
      res.json({
        ok: true,
        save: {
          id: out.save.id,
          filename: out.save.filename,
          backend: out.save.backend ?? "r2",
          sizeBytes: out.save.sizeBytes,
          createdAt: out.save.createdAt
        },
        download: out.download
      });
    } catch (error) {
      if (error?.code === "UNSUPPORTED_BACKEND") {
        res.status(409).json({
          ok: false,
          code: "UNSUPPORTED_BACKEND",
          message: "Save is not stored in cloud backend."
        });
        return;
      }
      const statusCode = error?.code === "R2_NOT_CONFIGURED" ? 400 : 500;
      res.status(statusCode).json({
        ok: false,
        code: error?.code ?? "SERVER_ERROR",
        message: error?.message ?? "Could not create download descriptor."
      });
    }
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
