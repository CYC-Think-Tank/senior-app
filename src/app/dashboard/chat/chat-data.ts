import { cache } from "react";
import { requireUser } from "@/lib/auth";
import {
  listChatMessages,
  listChatThreads,
  loadChatThread,
  markChatRead,
  unreadChatCount,
} from "@/lib/chat";

export const getChatInbox = cache(async () => {
  const { user } = await requireUser();
  const threads = await listChatThreads(user.id);
  return { viewerId: user.id, threads };
});

export const getUnreadChatCount = cache(async () => {
  const { user } = await requireUser();
  return unreadChatCount(user.id);
});

export async function getChatThread(threadId: string) {
  const { user } = await requireUser();
  const thread = await loadChatThread(user.id, threadId);
  if (!thread) return null;
  await markChatRead(user.id, threadId);
  const [threads, messages] = await Promise.all([
    listChatThreads(user.id),
    listChatMessages(user.id, threadId),
  ]);
  return {
    viewerId: user.id,
    threads,
    thread,
    messages: messages ?? [],
  };
}
