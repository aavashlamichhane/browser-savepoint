# Savepoint Server (v1)

Single-user server for encrypted tab backups. This server is ciphertext-only by default.

## Run

From repo root:

```bash
npm run server:start
```

Server starts at `http://localhost:8787` by default.

## Environment

- `PORT` (default `8787`)
- `SAVEPOINT_DATA_DIR` (default `server/data`)
- `SAVEPOINT_TRUST_PROXY` (default `false`, set to `true` behind reverse proxy)
- `SAVEPOINT_ACCESS_TTL_SEC` (default `900`)
- `SAVEPOINT_REFRESH_TTL_SEC` (default `2592000`)
- `SAVEPOINT_TRUSTED_RECOVERY_SECRET` (optional, for future trusted recovery mode)
- `SAVEPOINT_TRUSTED_RECOVERY_DEFAULT` (default `false`)
- `R2_ACCOUNT_ID` (required for R2)
- `R2_ACCESS_KEY_ID` (required for R2)
- `R2_SECRET_ACCESS_KEY` (required for R2)
- `R2_BUCKET` (required for R2)
- `R2_ENDPOINT` (optional override; default derived from account id)
- `R2_PUBLIC_BASE_URL` (optional)
- `R2_SIGNED_URL_TTL_SEC` (default `900`)
- `R2_MAX_UPLOAD_BYTES` (default `20971520`)

## Data at rest

- `state.json` stores auth verifier config and save metadata.
- `blobs/*.bsave` stores encrypted backup blobs.

The server cannot decrypt tab sessions in default mode.

## Cloudflare R2 backend

- The server mints short-lived signed PUT/GET URLs for extension upload/download.
- The extension never stores or receives R2 API secrets.
- If R2 env vars are missing, disk-backed saves continue to work and R2 routes return configuration errors.

## API

See `docs/server-api.md` for the full contract.

## Docker Compose

From repo root:

```bash
cp .env.docker.example .env.docker
docker compose up -d --build
```

Compose runs on `127.0.0.1:8787` and persists data in the `savepoint_data` volume mounted at `/data`.
