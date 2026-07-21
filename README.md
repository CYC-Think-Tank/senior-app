# Fireside — private audio-memoir podcast

An AI interviewer (OpenAI Realtime API) holds warm voice conversations with a senior, records them, and turns them into podcast episodes that — after the senior approves — release on a schedule to a private family feed.

## Roles

- **Senior (guest)** — talks with the AI host via an unguessable interview link, approves episodes via a review link. Never logs in.
- **Admin (producer)** — manages guests, edits transcripts, renders and schedules episodes. Logs in with a magic link.
- **Family** — invited by email, streams released episodes at `/feed`.

## Setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com).
   - Edit the `admin_emails` insert at the top of [supabase/migrations/001_init.sql](supabase/migrations/001_init.sql) (your email is pre-filled), then run the whole file in the SQL editor.
   - This creates the schema, RLS policies, the signup trigger, and the two private storage buckets.
   - Existing projects that ran the original schema must also run [supabase/migrations/002_family_dashboard.sql](supabase/migrations/002_family_dashboard.sql) to add the family-dashboard columns and policies.
2. **Environment**: copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API)
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (the sender must use a domain verified in Resend; `onboarding@resend.dev` only sends to the Resend account owner)
   - `OPENAI_API_KEY` (needs Realtime API access)
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

1. **Admin** creates a guest, then an interview session → copies the interview link.
2. **Senior** opens the link, presses the one big button, and talks with "Rosie" (WebRTC → OpenAI Realtime, `gpt-realtime`). Both sides of the audio are recorded in the browser and uploaded to Supabase Storage with a timestamped transcript.
3. **Admin** opens the transcript editor, strikes out any lines, and hits *Generate episode* — ffmpeg cuts the audio to the kept turns and GPT writes the title/description/show notes.
4. **Admin** sets a release date and sends the review link to the senior.
5. **Senior** listens and taps *I love it — share it* (or requests changes).
6. At the release time the episode appears automatically in the family feed.

## Notes

- Interview and review pages are token-gated (capability URLs) so the senior never needs an account.
- Audio buckets are private; playback always goes through short-lived signed URLs.
- ffmpeg comes from `ffmpeg-static` — no system install needed.
- Deploy note: the episode render route needs a runtime that allows ~1-minute requests and bundles the ffmpeg binary (a small VPS/Node host is simplest).
# senior-app
