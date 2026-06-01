import { createApp } from "./app.js";
import { AuthService } from "./auth/auth-service.js";
import { config } from "./config.js";
import { SaveRepository } from "./storage/save-repo.js";
import { StateStore } from "./storage/state-store.js";

const bootstrap = async () => {
  const store = new StateStore(config.dataDir);
  await store.init();

  const authService = new AuthService(store, config);
  const saveRepo = new SaveRepository(store);

  const app = createApp({
    authService,
    saveRepo,
    storageState: { dataDir: config.dataDir, trustProxy: config.trustProxy }
  });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[savepoint-server] listening on http://localhost:${config.port}`);
  });
};

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[savepoint-server] failed to start:", error);
  process.exit(1);
});
