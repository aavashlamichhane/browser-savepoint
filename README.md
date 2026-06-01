# Encrypted Tab Session Savepoint

Browser extension to export and import encrypted tab sessions. It is designed for normal and private/incognito workflows (when private access is enabled in browser extension settings).

## v1 Capabilities

- Export tabs from the current window into an encrypted `.bsave` file.
- Password-based encryption using Web Crypto:
  - PBKDF2 (SHA-256) key derivation with random salt.
  - AES-256-GCM encryption with random IV and integrity protection.
- Import encrypted `.bsave` files and open tabs into the current window.
- Large import confirmation and duplicate URL skipping.
- Cross-browser target: Chromium-based browsers + Firefox.

## Security model

- Session data is encrypted before file export.
- Password is never persisted by the extension.
- Plaintext session payload is not stored in extension storage.
- Wrong password or tampered file fails closed during decryption.

## Limitations

- Browser-restricted URLs (for example, `chrome://`, `about:`, privileged extension pages) are skipped from export.
- Private/incognito behavior depends on user-granted extension permission.
- Import opens tabs in current window and does not remove existing tabs.

## Local development

No build step is required for v1.

### Chromium (Chrome/Edge/Brave)

1. Open extensions page (`chrome://extensions` or equivalent).
2. Enable Developer mode.
3. Load unpacked extension from this folder.
4. In extension details, enable **Allow in incognito**.

### Firefox

1. Open `about:debugging`.
2. Choose **This Firefox** -> **Load Temporary Add-on**.
3. Select `manifest.json` from this project.
4. In add-on settings, enable running in private windows.

## Usage

1. Open extension popup.
2. Enter a password (minimum 8 chars).
3. Click **Export Current Window** and save `.bsave`.
4. To restore, select `.bsave` file and click **Import Into Current Window**.

## Testing

```bash
npm test
```

## File format migration note

Encrypted files include a versioned container header. Future versions should:

- Increment container version when format changes.
- Keep backward compatibility parser paths where feasible.
- Reject unsupported versions with a clear migration error message.

## v2 roadmap (deferred cloud integration)

Cloud upload/download is intentionally deferred until local flow is hardened.

- Google Drive adapter: OAuth + Drive API upload/download of encrypted `.bsave`.
- Cloudflare R2 adapter: presigned URL flow with strict CORS and short-lived signed URLs.
- Encryption remains local-first: only ciphertext is uploaded.
