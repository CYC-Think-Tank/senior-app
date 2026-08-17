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
import type { Locale } from "@/lib/i18n";
import styles from "./senior-dashboard.module.css";

const copyByLocale: Record<Locale, {
  name: string;
  save: string;
  cancel: string;
  saveError: string;
  inProgress: string;
  unfinished: string;
  listen: string;
  rename: string;
  export: string;
  share: string;
  delete: string;
  emptyTitle: string;
  emptyBody: string;
  recording: string;
  date: string;
  actions: string;
  deleteTitle: (name: string) => string;
  deleteBody: string;
  deleteError: string;
  keep: string;
  deleting: string;
  deletePermanently: string;
}> = {
  en: {
    name: "Conversation name", save: "Save", cancel: "Cancel", saveError: "Could not save",
    inProgress: "In progress", unfinished: "Not finished yet · Select to continue", listen: "Select to listen",
    rename: "Rename", export: "Export", share: "Share", delete: "Delete",
    emptyTitle: "No conversations yet", emptyBody: "After your first conversation, the recording will appear here.",
    recording: "Recording", date: "Date", actions: "Actions",
    deleteTitle: (name) => `Delete “${name}”?`,
    deleteBody: "This permanently deletes the recording and cannot be undone.",
    deleteError: "Could not delete it. Please try again.", keep: "Keep recording",
    deleting: "Deleting…", deletePermanently: "Delete permanently",
  },
  "zh-Hans": {
    name: "对话名称", save: "保存", cancel: "取消", saveError: "无法保存",
    inProgress: "进行中", unfinished: "尚未完成 · 点击继续", listen: "点击收听",
    rename: "重命名", export: "导出", share: "分享", delete: "删除",
    emptyTitle: "还没有对话", emptyBody: "开始第一次对话后，录音会显示在这里。",
    recording: "录音", date: "日期", actions: "操作",
    deleteTitle: (name) => `删除“${name}”？`, deleteBody: "这将永久删除录音，无法撤销。",
    deleteError: "无法删除，请重试。", keep: "保留录音", deleting: "正在删除…", deletePermanently: "永久删除",
  },
  "zh-Hant": {
    name: "對話名稱", save: "儲存", cancel: "取消", saveError: "無法儲存",
    inProgress: "進行中", unfinished: "尚未完成 · 點擊繼續", listen: "點擊收聽",
    rename: "重新命名", export: "匯出", share: "分享", delete: "刪除",
    emptyTitle: "還沒有對話", emptyBody: "開始第一次對話後，錄音會顯示在這裡。",
    recording: "錄音", date: "日期", actions: "操作",
    deleteTitle: (name) => `刪除「${name}」？`, deleteBody: "這將永久刪除錄音，無法復原。",
    deleteError: "無法刪除，請重試。", keep: "保留錄音", deleting: "正在刪除…", deletePermanently: "永久刪除",
  },
};

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
  const copy = copyByLocale[locale];
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
            aria-label={copy.name}
            onChange={(event) => setValue(event.target.value)}
          />
          <button className={styles.rowButton} type="submit" disabled={busy}>
            <Save aria-hidden="true" /> {copy.save}
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
            <X aria-hidden="true" /> {copy.cancel}
          </button>
          {error ? <span>{copy.saveError}</span> : null}
        </form>
      ) : (
        <Link className={styles.conversationMain} href={`/dashboard/${conversation.id}`}>
          <span className={styles.conversationDetails}>
            <span className={styles.conversationNameRow}>
              <span className={styles.conversationName}>{conversation.name}</span>
              {conversation.unfinished ? (
                <span className={styles.statusPill}>{copy.inProgress}</span>
              ) : null}
            </span>
            <span className={styles.conversationMeta}>
              {conversation.unfinished
                ? copy.unfinished
                : `${formatDuration(conversation.durationMs)} · ${copy.listen}`}
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
            <Pencil aria-hidden="true" /> {copy.rename}
          </button>
          <a
            className={styles.rowButton}
            href={`/api/family/conversations/export?conversationId=${encodeURIComponent(conversation.id)}`}
            download
          >
            <Download aria-hidden="true" />{" "}
            {copy.export}
          </a>
          {conversation.unfinished ? null : (
            <>
              <ShareConversation
                sessionId={conversation.id}
                initialToken={conversation.shareToken}
                origin={origin}
                buttonClassName={styles.rowButton}
                label={copy.share}
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
            <Trash2 aria-hidden="true" /> {copy.delete}
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
  const copy = copyByLocale[locale];
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
        <h2>{copy.emptyTitle}</h2>
        <p>{copy.emptyBody}</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.conversationTable}>
        <div className={styles.conversationHeader} aria-hidden="true">
          <span>{copy.recording}</span>
          <span>{copy.date}</span>
          <span>{copy.actions}</span>
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
          title={copy.deleteTitle(deleteTarget.name)}
          body={copy.deleteBody}
          error={
            deleteError
              ? copy.deleteError
              : undefined
          }
          cancelLabel={copy.keep}
          confirmLabel={
            deleting
              ? copy.deleting
              : copy.deletePermanently
          }
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}
