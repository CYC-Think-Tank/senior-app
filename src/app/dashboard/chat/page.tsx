import { getMyCircle } from "../friends/friends-data";
import { ChatApp } from "./chat-app";
import { getChatInbox } from "./chat-data";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const [inbox, circle] = await Promise.all([getChatInbox(), getMyCircle()]);

  return (
    <ChatApp
      viewerId={inbox.viewerId}
      threads={inbox.threads}
      friends={circle.friends}
      active={null}
    />
  );
}
