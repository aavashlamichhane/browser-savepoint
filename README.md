# Encrypted Tab Session Savepoint

Browser extension to export and import encrypted tab sessions with:

- server-backed encrypted storage (home server),
- local encrypted file fallback,
- memory-session unlock flow.

## What is implemented now

- Current-window tab export into encrypted `.bsave`.
- Local import from encrypted `.bsave`.
- Server account setup/login with single-user master-password verifier.
- Server save browser: list, restore, delete encrypted backups.
- Configurable `serverUrl` from extension popup.
- Offline fallback: local flow remains available when server is down.
- Password-based encryption using Web Crypto:
  - PBKDF2 (SHA-256) key derivation with random salt.
  - AES-256-GCM encryption with random IV and integrity protection.
- Large import confirmation and duplicate URL skipping.
- Cross-browser target: Chromium-based browsers + Firefox.

## Security modes

### Default mode: zero-knowledge (recommended)

- Session data is encrypted client-side before upload.
- Server stores ciphertext blobs and metadata only.
- Master password is never sent as plaintext.
- Unlock key material is memory-session only (lock on reload/restart).
- Plaintext session payload is not written to extension storage.

### Optional mode: trusted-server recovery (planned)

- Designed for single-owner self-host environments.
- Lowers cryptographic isolation for recovery convenience.
- Keep disabled unless you explicitly need it.

## Extension local storage usage

- Stores non-secret app settings (`serverUrl`, preferred mode).
- Does not store plaintext tab data.
- Does not persist unlocked master password.

## Limitations

- Browser-restricted URLs (for example, `chrome://`, `about:`, privileged extension pages) are skipped from export.
- Private/incognito behavior depends on user-granted extension permission.
- Import opens tabs in current window and does not remove existing tabs.
- Browser extension cannot arbitrarily browse your local filesystem. Local browsing uses file picker APIs.

## Run server

```bash
npm run server:start
```

Server docs:

- `server/README.md`
- `docs/server-api.md`

## Load extension

No bundler is required.

### Chromium (Chrome/Edge/Brave)

1. Open `chrome://extensions` or `edge://extensions`
2. Enable Developer mode
3. Load unpacked from this project folder
4. Enable **Allow in incognito/InPrivate**

### Firefox

1. Open `about:debugging`
2. Load temporary add-on with `manifest.json`
3. Enable private windows access

## Usage flow

1. Start your server and open extension popup.
2. Set `Server URL` and save settings.
3. Enter master password and click **Setup / Login**.
4. Export with target:
   - `Server storage` for online save,
   - `Local file (.bsave)` for fallback/manual backups.
5. Restore either:
   - from `Server Browser` list, or
   - from `Local Import` file picker.
6. Use **Lock** to clear in-memory session keys/tokens.

If server is unavailable, use local mode until the health check succeeds again.

## Testing

```bash
npm test
```

## Encrypted file format migration note

Encrypted files include a versioned container header. Future versions should:

- Increment container version when format changes.
- Keep backward compatibility parser paths where feasible.
- Reject unsupported versions with a clear migration error message.

## Roadmap

- Phase 2: Cloudflare R2 adapter (server-issued descriptors/presigned flow, ciphertext-only).
- Phase 3: Google Drive adapter (ciphertext-only file operations).
- Trusted recovery mode UX and secure setup hardening.

Encryption remains local-first in all phases: only ciphertext leaves the extension.
