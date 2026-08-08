"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { deleteComment, postComment } from "./actions";
import type { CommentView } from "./circle-data";
import { ConfirmDialog } from "../confirm-dialog";
import { Monogram } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";
import { MAX_COMMENT_LENGTH } from "@/lib/comments";
import styles from "../senior-dashboard.module.css";

function CommentRow({
  comment,
  canDelete,
  onDelete,
}: {
  comment: CommentView;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { locale, t } = useI18n();

  return (
    <article className={styles.commentRow}>
      <Monogram name={comment.authorName} />
      <div className={styles.commentBody}>
        <p className={styles.commentAuthor}>{comment.authorName}</p>
        {/* Stored with its line breaks intact; commentText preserves them. */}
        <p className={styles.commentText}>{comment.body}</p>
        <p className={styles.commentMeta}>
          {new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "short",
            day: "numeric",
          }).format(new Date(comment.createdAt))}
        </p>
      </div>
      {canDelete ? (
        <button
          className={`${styles.rowButton} ${styles.rowButtonDanger}`}
          type="button"
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" /> {t("commentsDelete")}
        </button>
      ) : null}
    </article>
  );
}

/**
 * The comment thread under a shared conversation.
 *
 * `canComment` is false on a conversation the owner has not shared with their
 * circle — there is nobody to be talking to yet.
 */
export function CommentThread({
  sessionId,
  comments,
  viewerId,
  isOwner,
  canComment,
}: {
  sessionId: string;
  comments: CommentView[];
  viewerId: string;
  isOwner: boolean;
  canComment: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommentView | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function post(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const result = await postComment(sessionId, body);
      if (!result.ok) {
        setError(true);
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteComment(deleteTarget.id);
      if (!result.ok) {
        setError(true);
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="comments-title">
      <div className={`${styles.sectionHeader} ${styles.commentsHeader}`}>
        <h2 id="comments-title">{t("commentsTitle")}</h2>
      </div>

      {comments.length ? (
        <div className={styles.commentList}>
          {comments.map((comment) => (
            <CommentRow
              comment={comment}
              // The storyteller can clear anything left on their own
              // conversation; everyone else only their own words.
              canDelete={isOwner || comment.authorId === viewerId}
              onDelete={() => setDeleteTarget(comment)}
              key={comment.id}
            />
          ))}
        </div>
      ) : (
        <div className={`${styles.conversationTable} ${styles.emptyState}`}>
          <MessageCircle aria-hidden="true" />
          <p>{t("commentsEmpty")}</p>
        </div>
      )}

      {canComment ? (
        <form className={styles.commentComposer} onSubmit={post}>
          <label className="sr-only" htmlFor="comment-body">
            {t("commentsPlaceholder")}
          </label>
          <textarea
            className={styles.settingsTextarea}
            id="comment-body"
            value={body}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder={t("commentsPlaceholder")}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className={styles.commentComposerActions}>
            <p className={styles.settingsHint}>{t("commentsNameNote")}</p>
            <button
              className={styles.smallStartButton}
              type="submit"
              disabled={busy || !body.trim()}
            >
              <Send aria-hidden="true" />{" "}
              {busy ? t("commentsPosting") : t("commentsPost")}
            </button>
          </div>
          {error ? (
            <p className={styles.settingsError} role="status" aria-live="polite">
              {t("commentsError")}
            </p>
          ) : null}
        </form>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={t("commentsDeleteTitle")}
          body={t("commentsDeleteBody")}
          cancelLabel={t("commentsDeleteCancel")}
          confirmLabel={t("commentsDeleteConfirm")}
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </section>
  );
}
