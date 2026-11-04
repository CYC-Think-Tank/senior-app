"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  addGroupMember,
  createGroupChat,
  openDirectChat,
  sendChatMessage,
} from "@/lib/chat";

function revalidateChat() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/chat");
}

export async function startDirectChat(friendId: string) {
  const { user } = await requireUser();
  const result = await openDirectChat(user.id, friendId);
  if (result.ok) revalidateChat();
  return result;
}

export async function startGroupChat(title: string, friendIds: string[]) {
  const { user } = await requireUser();
  const result = await createGroupChat(user.id, title, friendIds);
  if (result.ok) revalidateChat();
  return result;
}

export async function inviteToGroup(threadId: string, friendId: string) {
  const { user } = await requireUser();
  const result = await addGroupMember(user.id, threadId, friendId);
  if (result.ok) revalidateChat();
  return result;
}

export async function postChatMessage(threadId: string, body: string) {
  const { user } = await requireUser();
  const result = await sendChatMessage(user.id, threadId, body);
  if (result.ok) revalidateChat();
  return result;
}
