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
  "storage": "ready"
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
    "sizeBytes": 2048,
    "createdAt": "2026-06-01T12:30:01.000Z"
  }
}
```

### GET `/api/v1/saves`
Lists save metadata only (no blob).

### GET `/api/v1/saves/:id`
Returns encrypted blob for restore.

### DELETE `/api/v1/saves/:id`
Removes record and ciphertext blob.

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

## Future extensions

- `backend` selector (`serverDisk`, `r2`, `gdrive`) while preserving ciphertext-only uploads.
- Optional trusted recovery mode remains disabled by default.
