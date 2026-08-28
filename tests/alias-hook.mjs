import { register } from "node:module";
import { pathToFileURL } from "node:url";

/**
 * Teaches `node --test` the `@/` path alias from tsconfig.json.
 *
 * Most modules in this repo are written to be importable by node directly —
 * the encryption helpers say so explicitly — but the authorization module has
 * to reach the database layer, and both spell that `@/lib/…`. Rather than
 * bend the source to suit the test runner, the runner learns the one mapping
 * the compiler already uses.
 */
register(
  new URL("./alias-resolver.mjs", import.meta.url),
  pathToFileURL("./"),
);
