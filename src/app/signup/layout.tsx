import type { ReactNode } from "react";
import { redirectSignedInUser } from "@/lib/auth";

export default async function SignupLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await redirectSignedInUser();
  return children;
}
