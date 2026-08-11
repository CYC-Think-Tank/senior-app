# WiseShare — private audio memoirs

An AI interviewer (OpenAI Realtime API) holds warm voice conversations with a senior and records them, so their family can listen to the stories in their own voice.

## Roles

- **Senior (guest)** — talks with the AI host via an unguessable interview link. Never needs to log in.
- **Family** — signs up, starts their own conversations, and listens to finished recordings at `/dashboard`. Shares one by private link when they choose to.
- **Admin** — sees usage across the service at `/admin`, manages accounts at `/admin/users`, and can read a transcript at `/admin/sessions/<id>`.

## Setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com).
   - Edit the `admin_emails` insert at the top of [supabase/migrations/001_init.sql](supabase/migrations/001_init.sql) (your email is pre-filled), then run the whole file in the SQL editor.
   - This creates the schema, RLS policies, the signup trigger, and the two private storage buckets.
   - Existing projects that ran the original schema must also run [supabase/migrations/002_family_dashboard.sql](supabase/migrations/002_family_dashboard.sql) to add the family-dashboard columns and policies.
2. **Environment**: copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API)
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (the sender must use a domain verified in Resend; `onboarding@resend.dev` only sends to the Resend account owner)
   - `OPENAI_API_KEY` (needs Realtime API access)
   - `AUDIO_ENCRYPTION_KEY` (`openssl rand -base64 32`) — the app's at-rest key: it encrypts every recording, transcript turn, and private AI continuity summary under separate derived subkeys. Back it up; losing it makes that data unreadable. Data already saved is converted in place with `node --env-file=.env.local scripts/encrypt-existing-audio.mjs` and `node --env-file=.env.local scripts/encrypt-existing-transcripts.mjs` (both idempotent, so they are safe to re-run; the transcript one takes `--check` to report any plaintext left without writing).
3. **Run**: `npm install && npm run dev`
4. Sign in at `/login` with your admin email (magic link), and you'll land on `/admin`.

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
2. The storyteller presses the one big button and talks with "Rosie" (WebRTC → OpenAI Realtime, `gpt-realtime`). Both sides of the audio are recorded in the browser and uploaded to Supabase Storage in chunks, with a timestamped transcript.
3. On finish, ffmpeg stitches the chunks into the session's recording and marks it `ready`.
4. For a reusable senior, the server folds confirmed facts, interests, current activities, and safe follow-ups into an encrypted private continuity summary. Later, Rosie receives it only inside server-authored instructions and uses one safe detail as a natural icebreaker.
5. The recording appears under `/dashboard`, where it can be renamed, deleted, or given a permanent private share link (`/share/<token>`).

## Notes

- Interview and share pages are token-gated (capability URLs) so the senior never needs an account.
- The audio bucket is private; playback always goes through short-lived signed URLs.
- ffmpeg comes from `ffmpeg-static` — no system install needed.
# senior-app
