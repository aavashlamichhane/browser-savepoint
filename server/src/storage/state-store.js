import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFileAtomic } from "../utils/fs-json.js";

const defaultState = () => ({
  account: {
    configured: false,
    authSaltB64: "",
    authIterations: 0,
    authVerifierB64: "",
    trustedRecoveryEnabled: false,
    createdAt: null
  },
  saves: [],
  refreshTokens: []
});

export class StateStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.statePath = path.join(dataDir, "state.json");
    this.blobsDir = path.join(dataDir, "blobs");
    this.state = defaultState();
  }

  async init() {
    await ensureDir(this.dataDir);
    await ensureDir(this.blobsDir);
    this.state = await readJsonFile(this.statePath, defaultState());
    await this.persist();
  }

  async persist() {
    await writeJsonFileAtomic(this.statePath, this.state);
  }
}
