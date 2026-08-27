import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/config";

// Every Better Auth endpoint — sign-in, sign-out, password reset, session —
// is served from here. Nothing else in the app should route auth traffic.
export const { GET, POST } = toNextJsHandler(auth);
