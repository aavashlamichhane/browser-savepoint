import { constantTimeEqualBase64, newId, randomToken, sha256Base64 } from "../utils/crypto.js";

export class AuthService {
  constructor(stateStore, config) {
    this.stateStore = stateStore;
    this.config = config;
    this.accessTokens = new Map();
  }

  getAuthConfig() {
    const account = this.stateStore.state.account;
    return {
      configured: account.configured,
      authSaltB64: account.authSaltB64,
      authIterations: account.authIterations,
      trustedRecoveryEnabled: account.trustedRecoveryEnabled
    };
  }

  async setup({ authSaltB64, authIterations, authVerifierB64, trustedRecoveryEnabled }) {
    if (this.stateStore.state.account.configured) {
      return { ok: false, code: "ALREADY_CONFIGURED", message: "Server account is already configured." };
    }

    this.stateStore.state.account = {
      configured: true,
      authSaltB64,
      authIterations,
      authVerifierB64,
      trustedRecoveryEnabled: Boolean(trustedRecoveryEnabled),
      createdAt: new Date().toISOString()
    };

    await this.stateStore.persist();
    return { ok: true, configured: true };
  }

  async login({ authVerifierB64 }) {
    const account = this.stateStore.state.account;
    if (!account.configured) {
      return { ok: false, code: "NOT_CONFIGURED", message: "Server account is not configured yet." };
    }
    const isMatch = constantTimeEqualBase64(account.authVerifierB64, authVerifierB64);
    if (!isMatch) {
      return { ok: false, code: "AUTH_FAILED", message: "Login failed." };
    }

    const accessToken = randomToken();
    const refreshToken = randomToken();
    const now = Date.now();
    const accessExpiry = now + this.config.accessTokenTtlSec * 1000;
    const refreshExpiry = now + this.config.refreshTokenTtlSec * 1000;

    this.accessTokens.set(accessToken, { expiresAt: accessExpiry });
    this.stateStore.state.refreshTokens.push({
      id: newId("rt"),
      tokenHash: sha256Base64(refreshToken),
      expiresAt: new Date(refreshExpiry).toISOString(),
      createdAt: new Date().toISOString()
    });
    await this.stateStore.persist();

    return {
      ok: true,
      accessToken,
      refreshToken,
      expiresInSec: this.config.accessTokenTtlSec
    };
  }

  validateAccessToken(token) {
    const info = this.accessTokens.get(token);
    if (!info) {
      return false;
    }
    if (Date.now() > info.expiresAt) {
      this.accessTokens.delete(token);
      return false;
    }
    return true;
  }

  async refresh({ refreshToken }) {
    const refreshHash = sha256Base64(refreshToken);
    const nowIso = new Date().toISOString();
    const found = this.stateStore.state.refreshTokens.find((item) => item.tokenHash === refreshHash);
    if (!found || found.expiresAt < nowIso) {
      return { ok: false, code: "AUTH_FAILED", message: "Refresh failed." };
    }

    const accessToken = randomToken();
    const accessExpiry = Date.now() + this.config.accessTokenTtlSec * 1000;
    this.accessTokens.set(accessToken, { expiresAt: accessExpiry });

    return {
      ok: true,
      accessToken,
      expiresInSec: this.config.accessTokenTtlSec
    };
  }

  async logout({ refreshToken }) {
    const refreshHash = sha256Base64(refreshToken);
    const before = this.stateStore.state.refreshTokens.length;
    this.stateStore.state.refreshTokens = this.stateStore.state.refreshTokens.filter(
      (item) => item.tokenHash !== refreshHash
    );
    if (before !== this.stateStore.state.refreshTokens.length) {
      await this.stateStore.persist();
    }
    return { ok: true };
  }
}
