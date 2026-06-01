# Savepoint Server API Contract (v1)

This contract defines the server-backed mode for the extension.

## Security boundary

- Server stores only encrypted session blobs (`.bsave`) and non-sensitive metadata.
- Server does not receive plaintext tab data.
- Master password is never sent as plaintext.
- Client sends a derived auth verifier for login/setup.
- Session unlock remains memory-only in extension runtime.

## Versioning

- Base path: `/api/v1`
- All responses include:
  - `ok: boolean`
  - `code?: string` for machine-readable errors
  - `message?: string` for user-facing errors

## Auth model (single-user)

### POST `/api/v1/auth/setup`
Bootstraps single-user account once.

Request:

```json
{
  "authSaltB64": "base64-16bytes",
  "authIterations": 210000,
  "authVerifierB64": "base64-32bytes",
  "trustedRecoveryEnabled": false
}
```

Response:

```json
{
  "ok": true,
  "configured": true
}
```

### POST `/api/v1/auth/login`
Logs in with derived verifier.

Request:

```json
{
  "authVerifierB64": "base64-32bytes"
}
```

Response:

```json
{
  "ok": true,
  "accessToken": "token",
  "refreshToken": "token",
  "expiresInSec": 900
}
```

### POST `/api/v1/auth/refresh`
Rotates and returns a new access token.

Request:

```json
{
  "refreshToken": "token"
}
```

### POST `/api/v1/auth/logout`
Revokes active refresh token.

Request:

```json
{
  "refreshToken": "token"
}
```

### GET `/api/v1/auth/config`
Returns auth KDF config needed by client to derive login verifier.

Response:

```json
{
  "ok": true,
  "configured": true,
  "authSaltB64": "base64",
  "authIterations": 210000,
  "trustedRecoveryEnabled": false
}
```

## Health

### GET `/api/v1/health`

Response:

```json
{
  "ok": true,
  "status": "healthy",
  "storage": "ready",
  "r2Configured": true
}
```

## Saves API (ciphertext only)

All saves endpoints require `Authorization: Bearer <accessToken>`.

### POST `/api/v1/saves`

Request:

```json
{
  "filename": "tab-session-20260601-123000.bsave",
  "encryptedBase64": "....",
  "ciphertextMeta": {
    "clientCreatedAt": "2026-06-01T12:30:00.000Z"
  }
}
```

Response:

```json
{
  "ok": true,
  "save": {
    "id": "sv_abc123",
    "filename": "tab-session-20260601-123000.bsave",
    "backend": "disk",
    "sizeBytes": 2048,
    "createdAt": "2026-06-01T12:30:01.000Z"
  }
}
```

### GET `/api/v1/saves`
Lists save metadata only (no blob).

Each item includes:

- `backend`: `"disk"` or `"r2"`.

### POST `/api/v1/saves/presign-upload`
Prepares a Cloudflare R2 upload descriptor and registers save metadata.

Request:

```json
{
  "filename": "tab-session-20260601-123000.bsave",
  "sizeBytes": 2048,
  "contentType": "application/x-encrypted-tab-session",
  "ciphertextMeta": {
    "tabCount": 50
  }
}
```

Response:

```json
{
  "ok": true,
  "save": {
    "id": "sv_abc123",
    "filename": "tab-session-20260601-123000.bsave",
    "backend": "r2",
    "sizeBytes": 2048,
    "createdAt": "2026-06-01T12:30:01.000Z"
  },
  "upload": {
    "method": "PUT",
    "url": "https://....r2.cloudflarestorage.com/....",
    "headers": {
      "Content-Type": "application/x-encrypted-tab-session"
    },
    "expiresAt": "2026-06-01T12:45:01.000Z",
    "objectKey": "saves/sv_abc123/tab-session-20260601-123000.bsave"
  }
}
```

### GET `/api/v1/saves/:id`
Returns encrypted blob for restore.

For cloud-backed (`r2`) saves this route returns `UNSUPPORTED_BACKEND`; use presign-download.

### POST `/api/v1/saves/:id/presign-download`
Returns temporary Cloudflare R2 download descriptor for a cloud-backed save.

Response:

```json
{
  "ok": true,
  "save": {
    "id": "sv_abc123",
    "filename": "tab-session-20260601-123000.bsave",
    "backend": "r2",
    "sizeBytes": 2048,
    "createdAt": "2026-06-01T12:30:01.000Z"
  },
  "download": {
    "method": "GET",
    "url": "https://....r2.cloudflarestorage.com/....",
    "headers": {},
    "expiresAt": "2026-06-01T12:45:01.000Z",
    "objectKey": "saves/sv_abc123/tab-session-20260601-123000.bsave"
  }
}
```

### DELETE `/api/v1/saves/:id`
Removes record and ciphertext blob/object (disk or R2).

## Error model

Common `code` values:

- `NOT_CONFIGURED`
- `ALREADY_CONFIGURED`
- `AUTH_FAILED`
- `SESSION_EXPIRED`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `SERVER_UNAVAILABLE`
- `RATE_LIMITED`
- `R2_NOT_CONFIGURED`
- `UNSUPPORTED_BACKEND`

## Future extensions

- Additional cloud adapters (`gdrive`) while preserving ciphertext-only uploads.
- Optional trusted recovery mode remains disabled by default.
