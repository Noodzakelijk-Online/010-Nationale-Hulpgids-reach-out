# Operations Guide

This application has two normal ways to run:

- Windows desktop app for end users.
- Production web app exposed through ngrok for shared testing or hosted use.

Vite is still available for development only. End users and ngrok runs use the built application from `dist/`.

## Windows 11 Installer

Build the installer with:

```bash
pnpm installer:win
```

The generated `.exe` installer is written to `release/`.

The installed desktop app starts its own private local server on `127.0.0.1`, stores app data in the Windows user data folder, and creates its own local secrets on first launch. It does not require a database or OAuth login for local desktop use.

On launch, the desktop shell waits for the local `/api/health` endpoint before
opening the dashboard. If the bundled server fails to start or never becomes
ready, the app shows a failure dialog with a short redacted server log tail so
the operator is not left on an indefinite loading screen.

For a signed installer, provide Electron Builder signing variables before running the installer command:

```bash
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=certificate-password
pnpm installer:win:signed
```

Without these values, `pnpm installer:win` creates a working unsigned installer. The unsigned build keeps executable resource editing disabled because some locked-down Windows environments cannot extract Electron Builder's signing/resource helper without symlink privileges.

## Local Production Run

For a local production-style run without the installer:

```bash
pnpm build
pnpm start:local
```

Local data is stored in `.local-data/`, which is ignored by git.

## ngrok Run

For a public ngrok tunnel, build first and then run:

```bash
pnpm build
set NGROK_AUTHTOKEN=your-ngrok-token
set JWT_SECRET=a-long-random-secret-at-least-32-characters
set CREDENTIAL_ENCRYPTION_KEY=a-long-random-secret-at-least-32-characters
set VITE_APP_ID=your-manus-app-id
set OAUTH_SERVER_URL=https://your-oauth-server.example
pnpm start:ngrok
```

Hosted production/ngrok startup validates these settings before listening.
`JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` must be unique long random
values, and `OAUTH_SERVER_URL` must be an HTTPS URL that matches the configured
Manus OAuth environment.

Optional settings:

- `NGROK_DOMAIN` for a reserved ngrok domain.
- `PORT` for a custom local port.
- `HOST` for a custom bind host. The default is `127.0.0.1`.

Do not combine `LOCAL_DESKTOP_MODE` with `NGROK_ENABLED`. The server refuses that combination because desktop mode uses automatic local authentication and must not be publicly exposed.

## Resource Controls

These environment variables can tune resource use:

- `REQUEST_BODY_LIMIT`, default `5mb`.
- `SCRAPER_MAX_REQUESTS`, default `30`.
- `SCRAPER_MAX_REQUESTS` is capped at `250` to prevent runaway crawl loops and memory pressure.
- `MESSAGE_QUEUE_CONCURRENCY`, default `2`.
- `DISCOVERY_QUEUE_CONCURRENCY`, default `1`.

Lower the scraper and queue values on small machines. Raise them cautiously only after checking platform rate limits and user experience.
