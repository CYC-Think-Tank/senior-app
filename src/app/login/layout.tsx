import type { ReactNode } from "react";
import { redirectSignedInUser } from "@/lib/auth";

export default async function LoginLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await redirectSignedInUser();
  return children;
}

