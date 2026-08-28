import "server-only";

import { Pool, types } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export * from "./schema";

const TIMESTAMPTZ_OID = 1184;
const TIMESTAMP_OID = 1114;

/**
 * Hands `timestamptz` back as an ISO-8601 string instead of a JS `Date`.
 *
 * This is load-bearing, not a formatting preference. Postgres writes these
 * columns with `now()` at microsecond precision, and a JS `Date` only holds
 * milliseconds. Parsing into a `Date` and sending it back would therefore
 * compare a truncated value against the stored one, and the optimistic-lock
 * claims in `memory/summary.ts` and `memoir/workflow.ts` would match no rows —
 * silently, because an update that affects nothing is indistinguishable from
 * losing the race it is meant to detect.
 *
 * Keeping the full-precision string means the token round-trips exactly. It
 * also matches what the app already expects everywhere: `created_at` and
 * friends are typed as `string` in src/lib/types.ts and were ISO strings under
 * PostgREST. Postgres emits `2026-08-27 12:34:56.123456+00`, so only the
 * separator and the offset need normalising for `new Date()` to read it.
 */
function toIsoString(value: string): string {
  const withT = value.replace(" ", "T");
  // `+00` / `+05:30` / `-08` → `Z` / `+05:30` / `-08:00`, so the result is a
  // form every JS Date parser accepts. Connections are pinned to UTC below,
  // so in practice this is always the `+00` branch.
  return withT.replace(/([+-])(\d{2})(?::?(\d{2}))?$/, (_, sign, hh, mm) =>
    sign === "+" && hh === "00" && (!mm || mm === "00")
      ? "Z"
      : `${sign}${hh}:${mm ?? "00"}`,
  );
}

types.setTypeParser(TIMESTAMPTZ_OID, toIsoString);
// No column uses `timestamp without time zone`, but a future one must not
// quietly start arriving as a truncated Date either.
types.setTypeParser(TIMESTAMP_OID, (value) => value);

declare global {
  // Reused across hot reloads in development, and across invocations on a warm
  // Vercel instance, so one process never opens a second pool.
  var __seniorAppPool: Pool | undefined;
}

/**
 * Whether to negotiate TLS for this connection.
 *
 * Azure Flexible Server requires it, and that is the only database this app
 * talks to in a deployed environment. A local Postgres started by a developer
 * (or by the test suite) usually has no certificate at all and refuses the
 * handshake outright, so those are excluded rather than made to configure one.
 */
function needsTls(connectionString: string): boolean {
  if (/[?&]sslmode=disable(&|$)/.test(connectionString)) return false;
  try {
    const { hostname } = new URL(connectionString);
    return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1";
  } catch {
    // An unparseable string is somebody's own connection format; assume the
    // remote case, which is the one where getting this wrong is unsafe.
    return true;
  }
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const pool = new Pool({
    connectionString,
    // Azure's certificate chain is not in Node's default store on Vercel, so
    // verification is off while the connection itself stays encrypted.
    ssl: needsTls(connectionString) ? { rejectUnauthorized: false } : false,
    // Serverless functions are short-lived and many run at once, so each
    // instance keeps a small pool and returns connections quickly rather than
    // holding a slice of the server's connection budget open.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Pins the session so `timestamptz` always renders with a `+00` offset,
    // which is what toIsoString above is normalising.
    options: "-c timezone=UTC",
  });

  // A dead backend must not take the function down with it; the pool simply
  // opens a fresh connection on the next query.
  pool.on("error", (error) => {
    console.error("Postgres pool error:", error);
  });

  return pool;
}

export const pool = globalThis.__seniorAppPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.__seniorAppPool = pool;
}

/**
 * The one database handle for the app.
 *
 * Unlike the Supabase client it replaces, this has no row-level security
 * behind it: every query it runs sees every row. Authorization is explicit and
 * lives in src/lib/authz.ts — read that before adding a query that returns
 * rows belonging to somebody other than the caller.
 */
export const db = drizzle(pool, { schema });

export type Db = typeof db;
