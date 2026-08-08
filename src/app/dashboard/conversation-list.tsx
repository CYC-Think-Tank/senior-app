"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Headphones, Pencil, Save, Trash2, X } from "lucide-react";
import { deleteConversation, renameConversation } from "./actions";
import type { FamilyConversation } from "./family-data";
import { ShareConversation } from "@/components/share-conversation";
import { CircleShareToggle } from "./circle-share-toggle";
import { ConfirmDialog } from "./confirm-dialog";
import { formatDuration } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";
import styles from "./senior-dashboard.module.css";

function ConversationItem({
  conversation,
  origin,
  onDelete,
}: {
  conversation: FamilyConversation;
  origin: string;
  onDelete: () => void;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const chinese = locale !== "en";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(conversation.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const result = await renameConversation(conversation.id, value);
      if (!result.ok) {
        setError(true);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.conversationRow}>
      {editing ? (
        <form className={styles.editForm} onSubmit={save}>
          <input
            autoFocus
            className={styles.editInput}
            value={value}
            maxLength={120}
            aria-label={chinese ? "对话名称" : "Conversation name"}
            onChange={(event) => setValue(event.target.value)}
          />
          <button className={styles.rowButton} type="submit" disabled={busy}>
            <Save aria-hidden="true" /> {chinese ? "保存" : "Save"}
          </button>
          <button
            className={styles.rowButton}
            type="button"
            onClick={() => {
              setEditing(false);
              setValue(conversation.title ?? "");
              setError(false);
            }}
          >
            <X aria-hidden="true" /> {chinese ? "取消" : "Cancel"}
          </button>
          {error ? <span>{chinese ? "无法保存" : "Could not save"}</span> : null}
        </form>
      ) : (
        <Link className={styles.conversationMain} href={`/dashboard/${conversation.id}`}>
          <span className={styles.conversationDetails}>
            <span className={styles.conversationNameRow}>
              <span className={styles.conversationName}>{conversation.name}</span>
              {conversation.unfinished ? (
                <span className={styles.statusPill}>{chinese ? "进行中" : "In progress"}</span>
              ) : null}
            </span>
            <span className={styles.conversationMeta}>
              {conversation.unfinished
                ? chinese
                  ? "尚未完成 · 点击继续"
                  : "Not finished yet · Select to continue"
                : `${formatDuration(conversation.durationMs)} · ${chinese ? "点击收听" : "Select to listen"}`}
            </span>
          </span>
        </Link>
      )}
      <span className={styles.conversationDate}>
        {new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(conversation.createdAt))}
      </span>
      {!editing ? (
        <div className={styles.rowActions}>
          <button className={styles.rowButton} type="button" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" /> {chinese ? "重命名" : "Rename"}
          </button>
          <a
            className={styles.rowButton}
            href={`/api/family/conversations/export?conversationId=${encodeURIComponent(conversation.id)}`}
            download
          >
            <Download aria-hidden="true" />{" "}
            {locale === "zh-Hant"
              ? "匯出"
              : locale === "zh-Hans"
                ? "导出"
                : "Export"}
          </a>
          {conversation.unfinished ? null : (
            <>
              <ShareConversation
                sessionId={conversation.id}
                initialToken={conversation.shareToken}
                origin={origin}
                buttonClassName={styles.rowButton}
                label={chinese ? "分享" : "Share"}
              />
              <CircleShareToggle
                sessionId={conversation.id}
                shared={conversation.sharedWithCircle}
                compact
              />
            </>
          )}
          <button
            className={`${styles.rowButton} ${styles.rowButtonDanger}`}
            type="button"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" /> {chinese ? "删除" : "Delete"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ConversationList({
  conversations,
  origin,
}: {
  conversations: FamilyConversation[];
  origin: string;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const chinese = locale !== "en";
  const [deleteTarget, setDeleteTarget] = useState<FamilyConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      const result = await deleteConversation(deleteTarget.id);
      if (!result.ok) {
        setDeleteError(true);
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  }

  if (!conversations.length) {
    return (
      <div className={`${styles.conversationTable} ${styles.emptyState}`}>
        <Headphones aria-hidden="true" />
        <h2>{chinese ? "还没有对话" : "No conversations yet"}</h2>
        <p>{chinese ? "开始第一次对话后，录音会显示在这里。" : "After your first conversation, the recording will appear here."}</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.conversationTable}>
        <div className={styles.conversationHeader} aria-hidden="true">
          <span>{chinese ? "录音" : "Recording"}</span>
          <span>{chinese ? "日期" : "Date"}</span>
          <span>{chinese ? "操作" : "Actions"}</span>
        </div>
        {conversations.map((conversation) => (
          <ConversationItem
            conversation={conversation}
            origin={origin}
            onDelete={() => {
              setDeleteError(false);
              setDeleteTarget(conversation);
            }}
            key={conversation.id}
          />
        ))}
      </div>

      {deleteTarget ? (
        <ConfirmDialog
          title={chinese ? `删除“${deleteTarget.name}”？` : `Delete “${deleteTarget.name}”?`}
          body={
            chinese
              ? "这将永久删除录音，无法撤销。"
              : "This permanently deletes the recording and cannot be undone."
          }
          error={
            deleteError
              ? chinese
                ? "无法删除，请重试。"
                : "Could not delete it. Please try again."
              : undefined
          }
          cancelLabel={chinese ? "保留录音" : "Keep recording"}
          confirmLabel={
            deleting
              ? chinese
                ? "正在删除…"
                : "Deleting…"
              : chinese
                ? "永久删除"
                : "Delete permanently"
          }
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}
