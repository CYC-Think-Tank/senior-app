import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Lets `node --test` load the app's own modules.
 *
 * Two things the TypeScript compiler does that node's resolver does not:
 *
 *   * `@/x` means `<repo>/src/x` (the `paths` entry in tsconfig.json)
 *   * an import may leave off the `.ts`, or name a directory holding `index.ts`
 *
 * Both are resolved here rather than by bending the source to suit the test
 * runner. Anything that already resolves is left alone.
 */
const srcRoot = path.resolve(fileURLToPath(import.meta.url), "../../src");

/** The shapes an extensionless specifier could be on disk, in order. */
function candidates(target) {
  return [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")];
}

async function tryAll(paths, context, nextResolve) {
  for (const candidate of paths) {
    try {
      return await nextResolve(pathToFileURL(candidate).href, context);
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = await tryAll(
      candidates(path.join(srcRoot, specifier.slice(2))),
      context,
      nextResolve,
    );
    if (resolved) return resolved;
    return nextResolve(specifier, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // A relative import that resolved under the compiler but not here is
    // almost always a missing `.ts`.
    if (!specifier.startsWith(".") || !context.parentURL) throw error;
    const from = path.dirname(fileURLToPath(context.parentURL));
    const resolved = await tryAll(
      candidates(path.resolve(from, specifier)),
      context,
      nextResolve,
    );
    if (resolved) return resolved;
    throw error;
  }
}
