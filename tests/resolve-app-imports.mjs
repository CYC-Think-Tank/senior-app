/**
 * Lets `node --test` load modules from `src/` unchanged.
 *
 * Two things stand between the app's source and a plain Node import:
 *
 *   * `@/…` — the TypeScript path alias configured in tsconfig.json, which
 *     Node knows nothing about.
 *   * `server-only` — a marker Next.js resolves internally to fail a build
 *     that pulls server code into a client bundle. It is not a real installed
 *     package, so importing it outside Next throws.
 *
 * Registering this (`node --import ./tests/resolve-app-imports.mjs`) maps the
 * first onto `src/` and stubs the second, which is what makes modules like
 * `@/lib/authz` testable at all.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./resolve-app-imports-hooks.mjs", pathToFileURL("./tests/"));
