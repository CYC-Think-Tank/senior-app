import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
import { Wordmark } from "@/components/ui";

export default async function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Wordmark href="/feed" />
          <div className="flex items-center gap-2">
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink"
              >
                Admin
              </Link>
            )}
            <form action={signOut}>
              <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper-deep hover:text-ink">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
