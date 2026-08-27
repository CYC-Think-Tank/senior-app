import "server-only";
import {
  Pool,
  types as pgTypes,
  type PoolClient,
  type QueryConfig,
  type QueryResult,
} from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

/**
 * The connection to Azure Database for PostgreSQL Flexible Server.
 *
 * Serverless functions open many short-lived connections, so the pool is
 * deliberately small and cached on `globalThis`: Vercel's Fluid compute reuses
 * an instance across invocations, and without the cache a dev-server hot
 * reload would leak a fresh pool per edit. If `too many connections` shows up
 * in production, the fix is PgBouncer on the server (port 6432, General
 * Purpose tier and above) rather than a bigger pool here.
 */
const MAX_CONNECTIONS = Number(process.env.DATABASE_POOL_MAX ?? 5);

/** Postgres OID for `timestamp with time zone`. */
const TIMESTAMPTZ_OID = 1184;

/**
 * Where the connection settings come from.
 *
 * `DATABASE_URL` is the single-variable form, and the one Vercel is configured
 * with. When it is absent, `pg` falls back to the same `PGHOST` / `PGUSER` /
 * `PGPASSWORD` / `PGDATABASE` / `PGPORT` variables libpq reads — so a shell
 * already set up to run `psql` against Azure will run `next dev` against it
 * too, with nothing further to configure and no password to URL-encode.
 *
 * Returning `{}` rather than a connection string is what hands that fallback
 * to `pg`; it is not an empty config.
 */
function connectionConfig(): { connectionString?: string } {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  if (process.env.PGHOST) return {};

  throw new Error(
    "No database connection configured. Set DATABASE_URL, or the standard " +
      "PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT variables (see .env.example)."
  );
}

function createPool(): Pool {
  const pool = new Pool({
    ...connectionConfig(),
    max: MAX_CONNECTIONS,
    // Azure closes idle server-side connections; drop ours first so a
    // half-dead socket is never handed to a query.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Flexible Server requires TLS. Its certificate chains to the DigiCert
    // Global Root, which Node already trusts, so the certificate is verified
    // rather than blindly accepted. Set explicitly so it holds whichever way
    // the connection was configured above — in particular, a bare set of PG*
    // variables carries no sslmode of its own.
    ssl: { rejectUnauthorized: true },
    // Hand `timestamptz` back as the raw string. node-postgres would otherwise
    // parse it into a `Date` and lose the microseconds `now()` writes — which
    // silently breaks the optimistic-lock comparisons on `updated_at`. See the
    // long note in src/lib/db/columns.ts. Scoped to this pool rather than set
    // globally, so nothing else in the process is affected.
    types: {
      getTypeParser: ((oid: number, format?: unknown) =>
        oid === TIMESTAMPTZ_OID
          ? (value: string) => value
          : (pgTypes.getTypeParser as (o: number, f?: unknown) => unknown)(
              oid,
              format
            )) as unknown as typeof pgTypes.getTypeParser,
    },
  });

  // An idle client erroring out (server restart, failover) must not take the
  // process down — the pool discards it and the next query reconnects.
  pool.on("error", (error) => {
    console.error("Idle Postgres client error:", error);
  });

  return pool;
}

const globalForDb = globalThis as unknown as { __seniorAppPool?: Pool };

/**
 * A `pg.Pool` that is not opened until something actually queries it.
 *
 * `next build` imports every route to collect page data, so a pool built at
 * import time would make a missing `DATABASE_URL` fail the build rather than
 * the request — and it would have the build dial out to Azure to render static
 * pages that need nothing from it.
 *
 * The name matters: drizzle decides whether it can open a transaction by
 * checking whether the client's constructor name contains "Pool"
 * (`node-postgres/session`), and transactions need the `connect()` below.
 */
class LazyPool {
  #pool: Pool | undefined;

  #open(): Pool {
    if (!globalForDb.__seniorAppPool) {
      globalForDb.__seniorAppPool = createPool();
    }
    this.#pool = globalForDb.__seniorAppPool;
    return this.#pool;
  }

  query(
    queryConfig: string | QueryConfig,
    values?: unknown[]
  ): Promise<QueryResult> {
    return this.#open().query(queryConfig as string, values as unknown[]);
  }

  connect(): Promise<PoolClient> {
    return this.#open().connect();
  }

  end(): Promise<void> {
    return this.#pool ? this.#pool.end() : Promise.resolve();
  }
}

/**
 * The database handle. Every query in the app runs through this — there is no
 * user-scoped variant, because Postgres row-level security is gone: this
 * client has the reach the old service-role client had, and authorization is
 * applied explicitly in `src/lib/authz.ts` and its callers.
 */
export const db = drizzle(new LazyPool() as unknown as Pool, { schema });

export { schema };
export * from "@/lib/db/schema";
