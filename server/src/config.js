import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: process.env.SAVEPOINT_DATA_DIR
    ? path.resolve(process.env.SAVEPOINT_DATA_DIR)
    : path.resolve(process.cwd(), "server/data"),
  trustProxy: (process.env.SAVEPOINT_TRUST_PROXY ?? "false") === "true",
  accessTokenTtlSec: Number(process.env.SAVEPOINT_ACCESS_TTL_SEC ?? 900),
  refreshTokenTtlSec: Number(process.env.SAVEPOINT_REFRESH_TTL_SEC ?? 60 * 60 * 24 * 30),
  trustedRecoverySecret: process.env.SAVEPOINT_TRUSTED_RECOVERY_SECRET ?? "",
  trustedRecoveryDefault: (process.env.SAVEPOINT_TRUSTED_RECOVERY_DEFAULT ?? "false") === "true",
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
    endpoint: process.env.R2_ENDPOINT ?? "",
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
    signedUrlTtlSec: Number(process.env.R2_SIGNED_URL_TTL_SEC ?? 900),
    maxUploadBytes: Number(process.env.R2_MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024)
  }
};
