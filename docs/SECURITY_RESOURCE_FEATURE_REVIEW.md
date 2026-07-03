# Security, Resource, and Feature Review

Review date: 2026-05-24

## Security Findings Fixed

- Desktop local mode is blocked from starting an ngrok tunnel, so the local auto-login path cannot be exposed publicly by accident.
- Production sessions now fail closed when `JWT_SECRET` is missing.
- Stored platform credentials now use AES-256-GCM encryption, and credential list responses no longer return stored passwords, API keys, or session data.
- Campaign, candidate, and message actions now verify ownership before returning or mutating data.
- API procedures now apply the existing per-user rate limiter.
- Request bodies now default to `5mb` instead of `50mb`.
- Voice transcription fetches now require HTTPS, reject localhost/private targets, block redirects, time out, and can be restricted by `TRANSCRIPTION_AUDIO_HOST_ALLOWLIST`.
- Storage keys now reject empty and parent-directory path segments.
- Production/ngrok runs serve static build output instead of Vite middleware.
- Bulk message approval now requires an explicit consent/platform-compliance acknowledgement before any batch can be approved.
- Automated regression tests now cover credential redaction, hosted-production session secret fail-closed behavior, and blocked desktop/ngrok exposure.
- Hosted production session signing and credential encryption now reject short secret values instead of accepting weak `JWT_SECRET` or `CREDENTIAL_ENCRYPTION_KEY` settings.
- Hosted production/ngrok startup now validates OAuth app id, HTTPS OAuth server URL, strong session secret, and ngrok token before listening.
- The Windows desktop launcher now waits for `/api/health` before opening the dashboard, times out failed startup attempts, and shows a redacted recent server log tail instead of leaving the user on an indefinite loading screen.
- Audit/event persistence now centrally redacts secret-like strings inside JSON and plain-text audit state before storage, and ledger exports apply the same value-level redaction in addition to key-based redaction.
- Audit payloads for duplicate merges, response reclassification, follow-up skips, and credential saves now store bounded metadata instead of copying free-text reasons, full candidate identity context, profile URLs, phone numbers, or full credential emails into the audit trail.
- OAuth callback state decoding now validates base64 format, URL safety, protocol, callback path, local-only HTTP usage, and callback host before token exchange; malformed states return explicit 400 errors instead of collapsing to 500.
- OAuth login now starts on the server through `/api/oauth/login`, which issues short-lived HMAC-signed state before redirecting to the OAuth portal; callbacks now require signed state.
- Desktop local mode now reports external OAuth as intentionally disabled instead of logging a missing `OAUTH_SERVER_URL` error, while hosted production still fails closed through deployment validation.
- Scraper logs now summarize search criteria by presence/counts and record only target host plus stable URL hashes instead of raw care terms, locations, profile paths, emails, or query strings.
- Express now trusts proxy headers only from loopback, reducing spoofed forwarded-proto risk while preserving ngrok/local reverse-proxy behavior.
- Scheduled campaign execution now uses a bounded per-tick batch size and skips overlapping runs, reducing scheduler churn during load spikes.

## Remaining Security Work

- Configure the external OAuth provider callback URL for the final ngrok or production domain before shared use.
- Provision unique long random values for `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` in every non-desktop deployment.
- Confirm the legal and terms-of-service posture for each scraped platform before broad automated outreach.
- Continue expanding automated authorization regression tests when new owner-scoped procedures are added.
- Consider code signing for the Windows installer before distributing it outside a trusted group.

## Resource Usage Improvements Applied

- Vite is no longer loaded in production, ngrok, or packaged app runs.
- Server startup now rejects invalid `PORT` values and logs ngrok startup errors through a handled promise path.
- The desktop app launches one local server process and waits for it instead of requiring a separate terminal.
- Queue concurrency is configurable and defaults to conservative values.
- Audio transcription now streams downloads and enforces a hard 16MB file-size cap before full payload creation.
- Scraper request count is configurable and defaults to a smaller batch.
- Queue monitor polling was relaxed to reduce background requests.
- Campaign queue polling now runs only when the queue tab is visible.
- LLM response token defaults were reduced to avoid oversized responses and unnecessary latency.
- Static assets are served with caching headers.
- Vitest local-store data now defaults to `.test-local-data` instead of sharing desktop QA data, keeping repeated test runs from slowing down against accumulated app state.
- The lightweight `/api/health` endpoint exposes only readiness, runtime mode, uptime, and timestamp, giving the installer/desktop shell a cheap readiness probe without exposing secrets or ledger data.
- The dashboard Queue Health panel now uses one bounded health query instead of two separate stat calls and includes recent durable activity/error summaries for restart-safe operational visibility.
- Queue Monitor now supports owner-scoped cancellation for waiting/delayed durable queue jobs, records a medium-risk audit event, and redacts sensitive-looking cancellation notes.
- Active discovery jobs now support cooperative cancellation requests: the worker checks safe checkpoints, records `cancelled` instead of retrying or completing, and avoids misclassifying user cancellation as scraper failure.
- Discovery cancellation now passes an `AbortSignal` into scraper runs; direct fetch-based scraping can abort in-flight requests, and Crawlee-based adapters stop waiting at the shared abort boundary while checking before navigation and request handling.
- Queue startup no longer imports AI matching/LLM helpers; message drafting and compatibility scoring load that code only when the relevant queue job executes.
- Dashboard and campaign list operating summaries now avoid full ledger/audit payload construction, reuse shared readiness inputs, and bound per-request campaign summary fan-out to reduce memory and database pressure on large local ledgers.

## Further Resource Improvements

- Persist queue jobs in SQLite or Redis only when multi-process reliability is needed.
- Add scraper-specific Crawlee teardown hooks if future Crawlee versions expose a stable public API for force-stopping already-started crawls.
- Stream discovery progress in the UI instead of frequent polling.
- Continue deferring scraper and analytics tooling when new dashboard charts or platform adapters are added.

## Feature Improvements Applied

- First-run desktop onboarding now explains safe outreach, local data, and review requirements.
- Campaigns now include quiet hours and daily send limits.
- Message drafting now supports review-only tone presets and an optional bounded draft note without writing raw snippet text to audit logs.
- Platform connection cards now show credential health, last sync/error state, and a bounded recent connection history without exposing stored secrets.
- Campaign detail now includes quality metrics: response rate, acceptance rate, pending responses, average response time, rejection reasons, send failures, and delivery evidence rate.
- Campaigns now support dry-run mode, which allows discovery and draft generation while blocking message approvals, follow-up approvals, and external send attempts with audit entries.
- Campaign removal from the dashboard now archives campaigns instead of hard-deleting ledger records, preserves candidates/messages/audit history, stops scheduling, cancels scheduled follow-ups, freezes discovery/approval/send/follow-up outreach actions, and records high-risk audit events.
- Campaign detail now supports an acknowledgement-gated JSON ledger export for operational handoff, with user ownership checks, secret-field redaction inside exported audit state, and a high-risk `campaign.ledger_exported` audit event.
- Campaign detail now offers a redacted ledger export that preserves operational statuses, counts, dates, classifications, and decisions while removing candidate contact details, profile text, message bodies, response bodies, approval snapshots, send evidence text, and free-text qualification reasons.
- Platform credentials testing now uses a single scraper-backed connection check path across all platforms; authenticated-capable platforms use credential verification while public-only platforms return an explicit non-authenticated-mode message without marking connections.
- Campaign drafting now supports user-owned reusable message snippets in the wizard, with owner-only listing, archive support, and audit events that record snippet metadata without storing reusable body text.
- Campaign detail now supports acknowledgement-gated candidate import from pasted rows, creates normal candidate identity/source ledger records, returns duplicate warnings, and records redacted import audit events without raw candidate personal data.
- Candidate ledgers now support explicit qualification decisions, require a sensitive-assumption acknowledgement before marking a candidate qualified, and audit decision metadata without storing the free-text reason in audit logs.
- Campaign ledgers and exports now include candidate qualification rollups based on the latest decision per candidate, so Robert can see qualified, not-qualified, needs-review, and awaiting-decision counts without opening every candidate ledger.
- Outreach progression now respects explicit qualification decisions: candidates marked not qualified or needs review are blocked from approval, successful send recording, follow-up preparation/approval, and bulk outreach drafting until the latest decision is qualified.
- The Candidates overview now surfaces unresolved duplicate risk with a dedicated filter and per-candidate badge, using list-safe summary data that omits raw matching identifiers.
- Response Inbox now supports recording direct candidate replies without requiring a linked message, preserves the optional message link in the ledger, audits only classification/source/length metadata, and cancels unsafe active follow-ups when the reply says to stop or pause outreach.
- Response Inbox now defaults to a bounded latest-response query and supports campaign, classification, and row-limit filters so Robert can triage actionable replies without rendering the full historical response ledger.
- The direct-response candidate picker now uses a lean, owner-scoped, search-and-limit API instead of loading the full candidate ledger and duplicate/qualification summaries into the dialog.
- The Candidates overview now includes a guided duplicate-review queue with redacted pair signals, owner-scoped merge actions, and bounded results so duplicate identity cleanup does not require opening every candidate ledger one by one.
- Duplicate review now persists explicit merge/not-duplicate decisions in the operating ledger; dismissed false-positive pairs stop appearing in candidate duplicate summaries, candidate ledgers, and the guided review queue, with audit events that record metadata without raw identifiers or free-text reason content.
- Guided duplicate review now supports acknowledgement-gated batch dismissal for selected pairs, capped at 10 current queue pairs per action, while keeping identity merges single-pair and writing redacted batch audit metadata.
- Guided duplicate review now includes deterministic redacted explanations, recommended action labels, review checklist prompts, and false-positive checks so operators can decide faster without exposing raw email or phone values.
- Follow-up Queue now surfaces bounded stale no-response suggestions for candidates contacted at least five days ago, excludes candidates with recorded responses or active follow-up drafts, and creates review-only follow-up drafts without sending.
- Terminal stop responses now apply across all candidate sources in the same identity: approval, send recording, bulk drafting, follow-up preparation, and scheduled follow-up cancellation respect a decline or unavailable response recorded on another linked profile.
- Candidate ledgers now expose identity-wide outreach locks with a visible stop banner and high-priority next action, so operators can see when a linked source profile has declined or become unavailable before attempting more outreach.
- Candidate detail pages with an active outreach lock now suppress the automatic safe-use checklist dialog so the stop banner remains the first visible operator signal, while the checklist remains manually available from the navigation user menu.
- Candidate response panels now show the linked source response that stopped outreach for an identity, avoiding a contradictory "no responses" state when the stop signal came from another source profile.
- Dashboard and campaign-ledger next actions now include route-aware CTAs that take operators directly to message review, candidate triage, response inbox, follow-up queue, platform access, or the campaign ledger instead of forcing manual navigation from a generic campaign page.
- Next-action CTAs now carry focused queue filters in the URL, and Messages, Candidates, and Response Inbox initialize from those filters so operators land on queued approvals, failed sends, qualification triage, duplicate review, or unknown responses without manually re-filtering broad lists.
- Campaign readiness now flags successful send attempts that lack deterministic delivery evidence and started send attempts that remain open for more than 30 minutes, then surfaces those gaps as next actions before outreach continues.
- Manual candidate imports now run the same compatibility scoring path as discovery, persist match factors, store hourly-rate evidence, and show the import score/recommendation immediately so imported profiles enter the operating ledger with actionable match quality.

## Feature Improvements To Consider

- Extend scraper-driven connection validation to additional platforms as their terms and technical constraints allow.
