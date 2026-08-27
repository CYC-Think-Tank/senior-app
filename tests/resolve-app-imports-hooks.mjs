import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

/** An empty module, standing in for Next's `server-only` marker. */
const SERVER_ONLY_STUB = "data:text/javascript,export {};";

/**
 * TypeScript imports omit the file extension; Node requires it. Try the same
 * candidates `moduleResolution: "bundler"` would.
 */
const CANDIDATES = [".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx"];

function resolveSourceFile(target) {
  if (existsSync(target) && path.extname(target)) return target;
  for (const suffix of CANDIDATES) {
    const candidate = `${target}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return target;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: SERVER_ONLY_STUB, shortCircuit: true };
  }

  // `@/…` — the TypeScript path alias from tsconfig.json.
  if (specifier.startsWith("@/")) {
    const target = resolveSourceFile(
      path.join(projectRoot, "src", specifier.slice(2))
    );
    return nextResolve(pathToFileURL(target).href, context);
  }

  // A relative import between two source files, likewise extensionless.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:") &&
    !path.extname(specifier)
  ) {
    const target = resolveSourceFile(
      path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
    );
    if (path.extname(target)) {
      return nextResolve(pathToFileURL(target).href, context);
    }
  }

  return nextResolve(specifier, context);
}
