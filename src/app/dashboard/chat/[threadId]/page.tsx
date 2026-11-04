import { notFound } from "next/navigation";
import { getMyCircle } from "../../friends/friends-data";
import { ChatApp } from "../chat-app";
import { getChatThread } from "../chat-data";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const [bundle, circle] = await Promise.all([
    getChatThread(threadId),
    getMyCircle(),
  ]);
  if (!bundle) notFound();

  return (
    <ChatApp
      viewerId={bundle.viewerId}
      threads={bundle.threads}
      friends={circle.friends}
      active={{ thread: bundle.thread, messages: bundle.messages }}
    />
  );
}
