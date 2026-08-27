# WiseShare — private audio memoirs

An AI interviewer (OpenAI Realtime API) holds warm voice conversations with a senior and records them, so their family can listen to the stories in their own voice.

## Roles

- **Senior (guest)** — talks with the AI host via an unguessable interview link. Never needs to log in.
- **Family** — signs up, starts their own conversations, and listens to finished recordings at `/dashboard`. Shares one by private link when they choose to.
- **Admin** — sees usage across the service at `/admin`, manages accounts at `/admin/users`, and can read a transcript at `/admin/sessions/<id>`.

## Setup

1. **Database** — Azure Database for PostgreSQL Flexible Server.
   - Allow-list `PGCRYPTO` under **Server parameters → `azure.extensions`** first; the schema's token defaults need `gen_random_bytes()`.
   - Apply the schema, then the auth tables, then the seed, from a machine on the server's firewall allow-list:
     ```
     psql "$DATABASE_URL" -f supabase/migrations/001_migrate_azure.sql
     psql "$DATABASE_URL" -f supabase/migrations/002_better_auth.sql
     psql "$DATABASE_URL" -f supabase/seed.sql
     ```
   - The seed is one row: the address in `admin_emails` that gets the admin role at sign-up. Edit it to your own before running.
   - Schema changes from here are plain `.sql` files applied the same way; there is no migration runner.
2. **Storage** — an Azure Storage account with two **private** containers, `raw-audio` and `story-videos`. Nothing is ever served from them directly: uploads and playback are proxied through the app, which encrypts and decrypts on the way.
3. **Environment**: copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` (Azure portal → your server → Connect) and `AZURE_STORAGE_CONNECTION_STRING` (storage account → Access keys). `DATABASE_URL` is optional locally: with it unset the app falls back to the same `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`/`PGPORT` variables `psql` reads, so one exported set serves both the migrations and the dev server. TLS is verified either way.
   - `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) — signs sessions and password-reset tokens; changing it signs everyone out
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (the sender must use a domain verified in Resend; `onboarding@resend.dev` only sends to the Resend account owner)
   - `OPENAI_API_KEY` (needs Realtime API access)
   - `AUDIO_ENCRYPTION_KEY` (`openssl rand -base64 32`) — the app's at-rest key: it encrypts every recording, transcript turn, and private AI continuity summary under separate derived subkeys. Back it up; losing it makes that data unreadable. Data already saved is converted in place with `node --env-file=.env.local scripts/encrypt-existing-audio.mjs` and `node --env-file=.env.local scripts/encrypt-existing-transcripts.mjs` (both idempotent, so they are safe to re-run; the transcript one takes `--check` to report any plaintext left without writing).
4. **Run**: `npm install && npm run dev`
5. Sign up at `/signup` with the address you seeded into `admin_emails`, and you'll land on `/admin`.

### Optional Krisp background voice cancellation

The interview room automatically uses Krisp BVC when the browser SDK assets are present. Download the packed Web Browser SDK from the Krisp SDK Portal and place it under `public/krisp`:

- `public/krisp/krispsdk.mjs`
- `public/krisp/models/model_bvc.kef`
- `public/krisp/models/model_8.kef`
- `public/krisp/models/model_nc.kef`
- `public/krisp/assets/bvc-allowed.txt`

If those files are missing or the browser is unsupported, interviews fall back to the browser's built-in microphone processing.

## The pipeline

1. A conversation starts either from `/dashboard` (a signed-in account records their own) or from the public `/interview` flow.
2. The storyteller presses the one big button and talks with "Rosie" (WebRTC → OpenAI Realtime, `gpt-realtime`). Both sides of the audio are recorded in the browser and uploaded to Azure Blob Storage in chunks, with a timestamped transcript.
3. On finish, ffmpeg stitches the chunks into the session's recording and marks it `ready`.
4. For a reusable senior, the server folds confirmed facts, interests, current activities, and safe follow-ups into an encrypted private continuity summary. Later, Rosie receives it only inside server-authored instructions and uses one safe detail as a natural icebreaker.
5. The recording appears under `/dashboard`, where it can be renamed, deleted, or given a permanent private share link (`/share/<token>`).

## Notes

- Interview and share pages are token-gated (capability URLs) so the senior never needs an account.
- The storage containers are private and never fetched by the browser. Playback goes through `/api/audio/<token>`, which decrypts on the way out; the token is signed by the page that already did the authorization.
- **Authorization lives in `src/lib/authz.ts`.** It used to live in Postgres row-level security, where a forgotten check leaked nothing because the database applied the policy anyway. There is one unrestricted database client now, so every route and action applies its own filter, and `tests/authz.test.mjs` checks the predicates actually narrow. Read that file before touching a query that crosses accounts.
- ffmpeg comes from `ffmpeg-static` — no system install needed.
# senior-app
