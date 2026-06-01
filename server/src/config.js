import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: process.env.SAVEPOINT_DATA_DIR
    ? path.resolve(process.env.SAVEPOINT_DATA_DIR)
    : path.resolve(process.cwd(), "server/data"),
  accessTokenTtlSec: Number(process.env.SAVEPOINT_ACCESS_TTL_SEC ?? 900),
  refreshTokenTtlSec: Number(process.env.SAVEPOINT_REFRESH_TTL_SEC ?? 60 * 60 * 24 * 30),
  trustedRecoverySecret: process.env.SAVEPOINT_TRUSTED_RECOVERY_SECRET ?? "",
  trustedRecoveryDefault: (process.env.SAVEPOINT_TRUSTED_RECOVERY_DEFAULT ?? "false") === "true"
};
