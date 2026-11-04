"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, MessageCircle, Plus, Send, Users } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Monogram } from "@/components/ui";
import type { Locale } from "@/lib/i18n";
import {
  inviteToGroup,
  postChatMessage,
  startDirectChat,
  startGroupChat,
} from "./actions";
import styles from "../senior-dashboard.module.css";

type ThreadSummary = {
  id: string;
  kind: "direct" | "group";
  title: string;
  preview: string | null;
  previewAt: string | null;
  previewAuthorId: string | null;
  unread: boolean;
};

type Member = { userId: string; name: string };

type Message = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

type ActiveThread = {
  thread: {
    id: string;
    kind: "direct" | "group";
    title: string;
    members: Member[];
  };
  messages: Message[];
};

const copyByLocale: Record<
  Locale,
  {
    eyebrow: string;
    title: string;
    emptyList: string;
    emptyListBody: string;
    findFriends: string;
    newChat: string;
    newGroup: string;
    groupName: string;
    groupNamePlaceholder: string;
    createGroup: string;
    pickPeople: string;
    noFriendsBody: string;
    pickChat: string;
    you: string;
    noMessages: string;
    composer: string;
    send: string;
    sending: string;
    members: string;
    add: string;
    addPerson: string;
    back: string;
    notFriend: string;
    invalid: string;
    failed: string;
  }
> = {
  en: {
    eyebrow: "Messages",
    title: "Chat",
    emptyList: "No chats yet",
    emptyListBody: "Message a friend, or start a group.",
    findFriends: "Find friends",
    newChat: "New chat",
    newGroup: "New group",
    groupName: "Group name",
    groupNamePlaceholder: "Family dinner",
    createGroup: "Create group",
    pickPeople: "Choose at least one friend.",
    noFriendsBody: "Chats are only with people who have accepted your friend request.",
    pickChat: "Choose a conversation, or start a new one.",
    you: "You",
    noMessages: "No messages yet",
    composer: "Write a message",
    send: "Send",
    sending: "Sending…",
    members: "People",
    add: "Add",
    addPerson: "Add a friend",
    back: "All chats",
    notFriend: "You can only message accepted friends.",
    invalid: "Check the message and try again.",
    failed: "That didn't send. Please try again.",
  },
  "zh-Hans": {
    eyebrow: "消息",
    title: "聊天",
    emptyList: "还没有聊天",
    emptyListBody: "给朋友发消息，或创建一个群。",
    findFriends: "查找朋友",
    newChat: "新聊天",
    newGroup: "新建群组",
    groupName: "群组名称",
    groupNamePlaceholder: "家庭晚餐",
    createGroup: "创建群组",
    pickPeople: "请至少选择一位朋友。",
    noFriendsBody: "只能和已经接受好友请求的人聊天。",
    pickChat: "选择一个对话，或开始新的聊天。",
    you: "你",
    noMessages: "还没有消息",
    composer: "写一条消息",
    send: "发送",
    sending: "正在发送…",
    members: "成员",
    add: "添加",
    addPerson: "添加朋友",
    back: "全部聊天",
    notFriend: "只能给已接受的朋友发消息。",
    invalid: "请检查内容后再试。",
    failed: "没有发送成功，请重试。",
  },
  "zh-Hant": {
    eyebrow: "訊息",
    title: "聊天",
    emptyList: "還沒有聊天",
    emptyListBody: "傳訊息給朋友，或建立一個群組。",
    findFriends: "尋找朋友",
    newChat: "新聊天",
    newGroup: "新增群組",
    groupName: "群組名稱",
    groupNamePlaceholder: "家庭晚餐",
    createGroup: "建立群組",
    pickPeople: "請至少選擇一位朋友。",
    noFriendsBody: "只能和已經接受好友請求的人聊天。",
    pickChat: "選擇一個對話，或開始新的聊天。",
    you: "你",
    noMessages: "還沒有訊息",
    composer: "寫一則訊息",
    send: "傳送",
    sending: "正在傳送…",
    members: "成員",
    add: "加入",
    addPerson: "加入朋友",
    back: "全部聊天",
    notFriend: "只能傳訊給已接受的朋友。",
    invalid: "請檢查內容後再試。",
    failed: "沒有傳送成功，請重試。",
  },
};

function reasonText(
  reason: string,
  copy: (typeof copyByLocale)["en"],
) {
  if (reason === "not_friend") return copy.notFriend;
  if (reason === "invalid") return copy.invalid;
  return copy.failed;
}

export function ChatApp({
  viewerId,
  threads,
  friends,
  active,
}: {
  viewerId: string;
  threads: ThreadSummary[];
  friends: Member[];
  active: ActiveThread | null;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = copyByLocale[locale];
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [panel, setPanel] = useState<"none" | "direct" | "group">("none");
  const [groupTitle, setGroupTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [inviteId, setInviteId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    stick.current = true;
  }, [active?.thread.id]);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !stick.current) return;
    node.scrollTop = node.scrollHeight;
  }, [active?.messages]);

  const memberIds = new Set(active?.thread.members.map((member) => member.userId));
  const invitees = friends.filter((friend) => !memberIds.has(friend.userId));
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });

  async function openFriend(friendId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await startDirectChat(friendId);
      if (!result.ok) {
        setError(reasonText(result.reason, copy));
        return;
      }
      setPanel("none");
      router.push(`/dashboard/chat/${result.threadId}`);
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await startGroupChat(groupTitle, picked);
      if (!result.ok) {
        setError(reasonText(result.reason, copy));
        return;
      }
      setGroupTitle("");
      setPicked([]);
      setPanel("none");
      router.push(`/dashboard/chat/${result.threadId}`);
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    if (!active || !inviteId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await inviteToGroup(active.thread.id, inviteId);
      if (!result.ok) {
        setError(reasonText(result.reason, copy));
        return;
      }
      setInviteId("");
      router.refresh();
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postChatMessage(active.thread.id, body);
      if (!result.ok) {
        setError(reasonText(result.reason, copy));
        return;
      }
      setBody("");
      stick.current = true;
      router.refresh();
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 className={styles.title}>{copy.title}</h1>
        </div>
      </header>

      <div
        className={`${styles.chatShell} ${active ? styles.chatShellOpen : ""}`}
      >
        <section className={styles.chatList} aria-label={copy.title}>
          <div className={styles.chatListActions}>
            <button
              type="button"
              className={styles.exportButton}
              onClick={() =>
                setPanel((current) => (current === "direct" ? "none" : "direct"))
              }
            >
              <MessageCircle aria-hidden="true" /> {copy.newChat}
            </button>
            <button
              type="button"
              className={styles.exportButton}
              onClick={() =>
                setPanel((current) => (current === "group" ? "none" : "group"))
              }
            >
              <Users aria-hidden="true" /> {copy.newGroup}
            </button>
          </div>

          {panel === "direct" && (
            <div className={styles.chatPanel}>
              {friends.length === 0 ? (
                <p className={styles.chatHint}>
                  {copy.noFriendsBody}{" "}
                  <Link href="/dashboard/friends">{copy.findFriends}</Link>
                </p>
              ) : (
                <ul className={styles.chatPickList}>
                  {friends.map((friend) => (
                    <li key={friend.userId}>
                      <button
                        type="button"
                        className={styles.chatPick}
                        disabled={busy}
                        onClick={() => openFriend(friend.userId)}
                      >
                        <Monogram name={friend.name} />
                        <span>{friend.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {panel === "group" && (
            <form className={styles.chatPanel} onSubmit={createGroup}>
              <label className={styles.chatLabel}>
                {copy.groupName}
                <input
                  className={styles.settingsInput}
                  value={groupTitle}
                  maxLength={80}
                  placeholder={copy.groupNamePlaceholder}
                  onChange={(event) => setGroupTitle(event.target.value)}
                  required
                />
              </label>
              {friends.length === 0 ? (
                <p className={styles.chatHint}>{copy.noFriendsBody}</p>
              ) : (
                <ul className={styles.chatPickList}>
                  {friends.map((friend) => (
                    <li key={friend.userId}>
                      <label className={styles.chatCheck}>
                        <input
                          type="checkbox"
                          checked={picked.includes(friend.userId)}
                          onChange={(event) =>
                            setPicked((current) =>
                              event.target.checked
                                ? [...current, friend.userId]
                                : current.filter((id) => id !== friend.userId),
                            )
                          }
                        />
                        <span>{friend.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className={styles.chatHint}>{copy.pickPeople}</p>
              <button
                type="submit"
                className={styles.smallStartButton}
                disabled={busy || picked.length === 0}
              >
                <Plus aria-hidden="true" /> {copy.createGroup}
              </button>
            </form>
          )}

          {threads.length === 0 ? (
            <div className={styles.chatEmpty}>
              <p>{copy.emptyList}</p>
              <p className={styles.chatHint}>{copy.emptyListBody}</p>
              {friends.length === 0 && (
                <Link href="/dashboard/friends" className={styles.smallStartButton}>
                  {copy.findFriends}
                </Link>
              )}
            </div>
          ) : (
            <ul className={styles.chatThreads}>
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/dashboard/chat/${thread.id}`}
                    className={`${styles.chatThreadLink} ${
                      active?.thread.id === thread.id
                        ? styles.chatThreadLinkActive
                        : ""
                    }`}
                  >
                    <Monogram name={thread.title} />
                    <span className={styles.chatThreadText}>
                      <span className={styles.chatThreadTitle}>
                        {thread.kind === "group" && (
                          <Users aria-hidden="true" />
                        )}
                        {thread.title}
                      </span>
                      <span className={styles.chatThreadPreview}>
                        {thread.preview
                          ? `${
                              thread.previewAuthorId === viewerId
                                ? `${copy.you}: `
                                : ""
                            }${thread.preview}`
                          : copy.noMessages}
                      </span>
                    </span>
                    {thread.unread && (
                      <span className={styles.chatUnread} aria-hidden="true" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {error && !active && (
            <p className={styles.chatError} role="alert">
              {error}
            </p>
          )}
        </section>

        <section className={styles.chatThread} aria-live="polite">
          {active ? (
            <>
              <header className={styles.chatThreadHeader}>
                <Link
                  href="/dashboard/chat"
                  className={styles.chatBack}
                  aria-label={copy.back}
                >
                  <ArrowLeft aria-hidden="true" />
                </Link>
                <div>
                  <h2>{active.thread.title}</h2>
                  {active.thread.kind === "group" && (
                    <p>
                      {copy.members}:{" "}
                      {active.thread.members.map((member) => member.name).join(", ")}
                    </p>
                  )}
                </div>
              </header>
              {active.thread.kind === "group" && invitees.length > 0 && (
                <form className={styles.chatInvite} onSubmit={addPerson}>
                  <label className={styles.chatLabel}>
                    {copy.addPerson}
                    <select
                      className={styles.settingsInput}
                      value={inviteId}
                      onChange={(event) => setInviteId(event.target.value)}
                    >
                      <option value="">{copy.addPerson}</option>
                      {invitees.map((friend) => (
                        <option key={friend.userId} value={friend.userId}>
                          {friend.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className={styles.exportButton}
                    disabled={busy || !inviteId}
                  >
                    {copy.add}
                  </button>
                </form>
              )}
              <div
                className={styles.chatMessages}
                ref={scroller}
                onScroll={(event) => {
                  const node = event.currentTarget;
                  stick.current =
                    node.scrollHeight - node.scrollTop - node.clientHeight < 80;
                }}
              >
                {active.messages.length === 0 && (
                  <p className={styles.chatHint}>{copy.noMessages}</p>
                )}
                {active.messages.map((message) => {
                  const mine = message.authorId === viewerId;
                  return (
                    <article
                      key={message.id}
                      className={`${styles.chatBubble} ${
                        mine ? styles.chatBubbleMine : ""
                      }`}
                    >
                      {active.thread.kind === "group" && !mine && (
                        <p className={styles.chatBubbleName}>{message.authorName}</p>
                      )}
                      <p className={styles.chatBubbleBody}>{message.body}</p>
                      <time dateTime={message.createdAt}>
                        {time.format(new Date(message.createdAt))}
                      </time>
                    </article>
                  );
                })}
              </div>
              <form className={styles.chatComposer} onSubmit={send}>
                <label className={styles.chatLabel}>
                  <span className={styles.chatVisuallyHidden}>{copy.composer}</span>
                  <textarea
                    className={styles.chatInput}
                    value={body}
                    rows={2}
                    maxLength={2000}
                    placeholder={copy.composer}
                    onChange={(event) => setBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                </label>
                <button
                  type="submit"
                  className={styles.smallStartButton}
                  disabled={busy || !body.trim()}
                >
                  <Send aria-hidden="true" /> {busy ? copy.sending : copy.send}
                </button>
              </form>
              {error && (
                <p className={styles.chatError} role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            <div className={styles.chatEmptyPane}>
              <MessageCircle aria-hidden="true" />
              <p>{friends.length === 0 ? copy.noFriendsBody : copy.pickChat}</p>
              {friends.length === 0 && (
                <Link href="/dashboard/friends" className={styles.smallStartButton}>
                  {copy.findFriends}
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
