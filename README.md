# Nationale Hulpgids Reach-Out

An outreach tool for finding, matching, and contacting care professionals across Dutch platforms. It supports campaign setup, candidate discovery, AI-assisted matching, message review, and queue monitoring.

## What It Does

- Finds candidates across Nationale Hulpgids, Indeed, PGBvacatures, Zorgbanen, and Jobbird.
- Scores candidate fit against campaign criteria.
- Drafts personalized outreach messages.
- Lets the user review and edit messages before sending.
- Tracks campaigns, candidates, messages, and queue status.
- Runs as a Windows desktop app or as a production web app through ngrok.

## Run Modes

### Windows 11 Desktop App

Build an installer:

```bash
pnpm installer:win
```

The `.exe` installer is created in `release/`. The installed app runs locally, stores data in the Windows user data folder, and creates local secrets on first launch.

### ngrok Production Run

```bash
pnpm build
set NGROK_AUTHTOKEN=your-ngrok-token
set JWT_SECRET=a-long-random-secret-at-least-32-characters
set CREDENTIAL_ENCRYPTION_KEY=a-long-random-secret-at-least-32-characters
set VITE_APP_ID=your-manus-app-id
set OAUTH_SERVER_URL=https://your-oauth-server.example
pnpm start:ngrok
```

Vite is not used for ngrok or end-user runs. The app serves the built files from `dist/`.

### Local Production Run

```bash
pnpm build
pnpm start:local
```

Local data is stored in `.local-data/`.

### Development

```bash
pnpm dev
```

Development mode uses Vite for hot reloading.

## Required Tools

- Node.js 22+
- pnpm
- Windows 11 for the installer target
- ngrok account/token for public tunnel runs

Server deployments also need:

- MySQL or TiDB through `DATABASE_URL`
- `JWT_SECRET`, at least 32 characters
- `CREDENTIAL_ENCRYPTION_KEY`, at least 32 characters
- `VITE_APP_ID`
- `OAUTH_SERVER_URL`
- OAuth/LLM environment variables for the hosted environment

Desktop local mode does not require MySQL or OAuth.

## Useful Commands

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm installer:win
```

## Configuration

Security:

- `JWT_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`
- `NGROK_AUTHTOKEN`
- `NGROK_DOMAIN`
- `TRANSCRIPTION_AUDIO_HOST_ALLOWLIST`

Resource controls:

- `REQUEST_BODY_LIMIT`, default `5mb`
- `SCRAPER_MAX_REQUESTS`, default `30`
- `MESSAGE_QUEUE_CONCURRENCY`, default `2`
- `DISCOVERY_QUEUE_CONCURRENCY`, default `1`
- `SCHEDULED_CAMPAIGN_BATCH_SIZE`, default `20` (cap per scheduler tick, max `200`)

## Documentation

- [Operations guide](docs/OPERATIONS.md)
- [Security, resource, and feature review](docs/SECURITY_RESOURCE_FEATURE_REVIEW.md)

## Project Layout

```text
client/      React frontend
desktop/    Electron desktop launcher
server/     Express, tRPC, queues, scraping, matching
shared/     Shared types
drizzle/    Database schema and migrations
docs/       Operator and review notes
```

## Security Notes

- Desktop mode refuses to start ngrok because it uses local auto-login.
- Production sessions require `JWT_SECRET`.
- Stored platform credentials are encrypted.
- Credential list responses do not expose stored secrets.
- Campaign and message data is scoped to the current user.

## License

Proprietary software owned by Noodzakelijk Online.
