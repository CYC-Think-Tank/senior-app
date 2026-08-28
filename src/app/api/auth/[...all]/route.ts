import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/config";

/**
 * Better Auth's own endpoints: sign-in, sign-out, session, password reset.
 *
 * The web app reaches these through server actions rather than the browser, so
 * this route exists mainly for the flows that arrive as a link — the
 * password-reset redirect — and for the iOS app, which signs in over HTTP and
 * then sends its session token as a bearer.
 */
export const { GET, POST } = toNextJsHandler(auth);
