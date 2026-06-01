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

## Data at rest

- `state.json` stores auth verifier config and save metadata.
- `blobs/*.bsave` stores encrypted backup blobs.

The server cannot decrypt tab sessions in default mode.

## API

See `docs/server-api.md` for the full contract.

## Docker Compose

From repo root:

```bash
cp .env.docker.example .env.docker
docker compose up -d --build
```

Compose runs on `127.0.0.1:8787` and persists data in the `savepoint_data` volume mounted at `/data`.
