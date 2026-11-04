import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { isFriend } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  chatMembers,
  chatMessages,
  chatThreads,
  profiles,
} from "@/lib/db/schema";
import { friendshipPair } from "@/lib/friends";
import { personName } from "@/lib/names";

export const MAX_CHAT_LENGTH = 2000;
export const MAX_GROUP_TITLE = 80;
export const MAX_GROUP_MEMBERS = 50;

export type ChatKind = "direct" | "group";

export type ChatThreadSummary = {
  id: string;
  kind: ChatKind;
  title: string;
  preview: string | null;
  previewAt: string | null;
  previewAuthorId: string | null;
  unread: boolean;
};

export type ChatMemberView = {
  userId: string;
  name: string;
};

export type ChatMessageView = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type ChatThreadView = {
  id: string;
  kind: ChatKind;
  title: string;
  members: ChatMemberView[];
};

type ChatFailure = "invalid" | "not_friend" | "not_member" | "failed";

function cleanBody(value: string) {
  const body = value.replace(/\r\n/g, "\n").trim();
  if (body.length < 1 || body.length > MAX_CHAT_LENGTH) return null;
  return body;
}

function cleanTitle(value: string) {
  const title = value.replace(/\s+/gu, " ").trim();
  if (title.length < 1 || title.length > MAX_GROUP_TITLE) return null;
  return title;
}

function laterThan(left: string, right: string | null) {
  if (!right) return true;
  return Date.parse(left) > Date.parse(right);
}

async function memberOf(userId: string, threadId: string) {
  const [row] = await db
    .select({ threadId: chatMembers.threadId })
    .from(chatMembers)
    .where(
      and(eq(chatMembers.threadId, threadId), eq(chatMembers.userId, userId)),
    )
    .limit(1);
  return Boolean(row);
}

async function namesFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(profiles)
    .where(inArray(profiles.id, ids));
  return new Map(
    rows.map((row) => [row.id, personName(row.displayName, row.email)]),
  );
}

async function myName(userId: string) {
  const names = await namesFor([userId]);
  return names.get(userId) ?? "Friend";
}

/** Accepted friends only. Pending requests cannot be added to a chat. */
async function acceptedFriends(userId: string, ids: string[]) {
  const unique = [...new Set(ids.filter((id) => id && id !== userId))];
  const allowed: string[] = [];
  for (const id of unique) {
    if (await isFriend(userId, id)) allowed.push(id);
  }
  return allowed;
}

export async function listChatThreads(
  userId: string,
): Promise<ChatThreadSummary[]> {
  const mine = await db
    .select({
      threadId: chatMembers.threadId,
      lastReadAt: chatMembers.lastReadAt,
    })
    .from(chatMembers)
    .where(eq(chatMembers.userId, userId));
  if (mine.length === 0) return [];

  const threadIds = mine.map((row) => row.threadId);
  const readAt = new Map(mine.map((row) => [row.threadId, row.lastReadAt]));

  const [threads, previews, members] = await Promise.all([
    db
      .select()
      .from(chatThreads)
      .where(inArray(chatThreads.id, threadIds))
      .orderBy(desc(chatThreads.updatedAt)),
    db
      .selectDistinctOn([chatMessages.threadId], {
        threadId: chatMessages.threadId,
        body: chatMessages.body,
        authorId: chatMessages.authorId,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(inArray(chatMessages.threadId, threadIds))
      .orderBy(chatMessages.threadId, desc(chatMessages.createdAt)),
    db
      .select({
        threadId: chatMembers.threadId,
        userId: chatMembers.userId,
      })
      .from(chatMembers)
      .where(inArray(chatMembers.threadId, threadIds)),
  ]);

  const names = await namesFor(members.map((row) => row.userId));
  const previewByThread = new Map(previews.map((row) => [row.threadId, row]));
  const othersByThread = new Map<string, string[]>();
  for (const member of members) {
    if (member.userId === userId) continue;
    const list = othersByThread.get(member.threadId) ?? [];
    const name = names.get(member.userId);
    if (name) list.push(name);
    othersByThread.set(member.threadId, list);
  }

  return threads.map((thread) => {
    const preview = previewByThread.get(thread.id) ?? null;
    const others = (othersByThread.get(thread.id) ?? []).sort((a, b) =>
      a.localeCompare(b),
    );
    const title =
      thread.kind === "group"
        ? (thread.title ?? "Group")
        : (others[0] ?? "Friend");
    return {
      id: thread.id,
      kind: thread.kind === "group" ? "group" : "direct",
      title,
      preview: preview?.body ?? null,
      previewAt: preview?.createdAt ?? thread.updatedAt,
      previewAuthorId: preview?.authorId ?? null,
      unread: Boolean(
        preview &&
          preview.authorId !== userId &&
          laterThan(preview.createdAt, readAt.get(thread.id) ?? null),
      ),
    };
  });
}

export async function unreadChatCount(userId: string) {
  const threads = await listChatThreads(userId);
  return threads.filter((thread) => thread.unread).length;
}

export async function loadChatThread(
  userId: string,
  threadId: string,
): Promise<ChatThreadView | null> {
  if (!(await memberOf(userId, threadId))) return null;
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1);
  if (!thread) return null;

  const members = await db
    .select({ userId: chatMembers.userId })
    .from(chatMembers)
    .where(eq(chatMembers.threadId, threadId));
  const names = await namesFor(members.map((row) => row.userId));
  const views = members
    .map((row) => ({
      userId: row.userId,
      name: names.get(row.userId) ?? "Friend",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const others = views.filter((member) => member.userId !== userId);
  return {
    id: thread.id,
    kind: thread.kind === "group" ? "group" : "direct",
    title:
      thread.kind === "group"
        ? (thread.title ?? "Group")
        : (others[0]?.name ?? "Friend"),
    members: views,
  };
}

export async function listChatMessages(
  userId: string,
  threadId: string,
): Promise<ChatMessageView[] | null> {
  if (!(await memberOf(userId, threadId))) return null;
  const rows = await db
    .select({
      id: chatMessages.id,
      authorId: chatMessages.authorId,
      authorName: chatMessages.authorName,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(200);
  return rows.reverse();
}

export async function markChatRead(userId: string, threadId: string) {
  await db
    .update(chatMembers)
    .set({ lastReadAt: new Date().toISOString() })
    .where(
      and(eq(chatMembers.threadId, threadId), eq(chatMembers.userId, userId)),
    );
}

async function directStillOpen(userId: string, threadId: string) {
  const members = await db
    .select({ userId: chatMembers.userId })
    .from(chatMembers)
    .where(eq(chatMembers.threadId, threadId));
  const other = members.find((member) => member.userId !== userId);
  if (!other) return false;
  return isFriend(userId, other.userId);
}

export async function sendChatMessage(
  userId: string,
  threadId: string,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; reason: ChatFailure }> {
  const body = cleanBody(rawBody);
  if (!body) return { ok: false, reason: "invalid" };
  if (!(await memberOf(userId, threadId))) {
    return { ok: false, reason: "not_member" };
  }

  const [thread] = await db
    .select({ kind: chatThreads.kind })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1);
  if (!thread) return { ok: false, reason: "not_member" };
  if (thread.kind === "direct" && !(await directStillOpen(userId, threadId))) {
    return { ok: false, reason: "not_friend" };
  }

  const now = new Date().toISOString();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(chatMessages).values({
        threadId,
        authorId: userId,
        authorName: await myName(userId),
        body,
      });
      await tx
        .update(chatThreads)
        .set({ updatedAt: now })
        .where(eq(chatThreads.id, threadId));
      await tx
        .update(chatMembers)
        .set({ lastReadAt: now })
        .where(
          and(
            eq(chatMembers.threadId, threadId),
            eq(chatMembers.userId, userId),
          ),
        );
    });
  } catch (error) {
    console.error("Could not send a chat message:", error);
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}

export async function openDirectChat(
  userId: string,
  friendId: string,
): Promise<{ ok: true; threadId: string } | { ok: false; reason: ChatFailure }> {
  if (!friendId || friendId === userId) return { ok: false, reason: "invalid" };
  if (!(await isFriend(userId, friendId))) {
    return { ok: false, reason: "not_friend" };
  }
  const { low, high } = friendshipPair(userId, friendId);
  const [existing] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(and(eq(chatThreads.directLow, low), eq(chatThreads.directHigh, high)))
    .limit(1);
  if (existing) return { ok: true, threadId: existing.id };

  try {
    const threadId = await db.transaction(async (tx) => {
      const [thread] = await tx
        .insert(chatThreads)
        .values({
          kind: "direct",
          createdBy: userId,
          directLow: low,
          directHigh: high,
        })
        .returning({ id: chatThreads.id });
      if (!thread) throw new Error("No thread row was created.");
      await tx.insert(chatMembers).values([
        { threadId: thread.id, userId },
        { threadId: thread.id, userId: friendId },
      ]);
      return thread.id;
    });
    return { ok: true, threadId };
  } catch (error) {
    const [again] = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(
        and(eq(chatThreads.directLow, low), eq(chatThreads.directHigh, high)),
      )
      .limit(1);
    if (again) return { ok: true, threadId: again.id };
    console.error("Could not open a direct chat:", error);
    return { ok: false, reason: "failed" };
  }
}

export async function createGroupChat(
  userId: string,
  rawTitle: string,
  friendIds: string[],
): Promise<{ ok: true; threadId: string } | { ok: false; reason: ChatFailure }> {
  const title = cleanTitle(rawTitle);
  const friends = await acceptedFriends(userId, friendIds);
  if (!title || friends.length < 1 || friends.length > MAX_GROUP_MEMBERS - 1) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const threadId = await db.transaction(async (tx) => {
      const [thread] = await tx
        .insert(chatThreads)
        .values({ kind: "group", title, createdBy: userId })
        .returning({ id: chatThreads.id });
      if (!thread) throw new Error("No thread row was created.");
      await tx.insert(chatMembers).values([
        { threadId: thread.id, userId },
        ...friends.map((friendId) => ({ threadId: thread.id, userId: friendId })),
      ]);
      return thread.id;
    });
    return { ok: true, threadId };
  } catch (error) {
    console.error("Could not create a group chat:", error);
    return { ok: false, reason: "failed" };
  }
}

export async function addGroupMember(
  userId: string,
  threadId: string,
  friendId: string,
): Promise<{ ok: true } | { ok: false; reason: ChatFailure }> {
  if (!friendId || friendId === userId) return { ok: false, reason: "invalid" };
  const thread = await loadChatThread(userId, threadId);
  if (!thread) return { ok: false, reason: "not_member" };
  if (thread.kind !== "group") return { ok: false, reason: "invalid" };
  if (thread.members.some((member) => member.userId === friendId)) {
    return { ok: true };
  }
  if (thread.members.length >= MAX_GROUP_MEMBERS) {
    return { ok: false, reason: "invalid" };
  }
  if (!(await isFriend(userId, friendId))) {
    return { ok: false, reason: "not_friend" };
  }

  try {
    await db.insert(chatMembers).values({ threadId, userId: friendId });
  } catch (error) {
    console.error("Could not add a group member:", error);
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}
