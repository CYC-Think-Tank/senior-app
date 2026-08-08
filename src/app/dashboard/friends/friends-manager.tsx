"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Search, UserPlus, UserX, X } from "lucide-react";
import {
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  searchFriendByEmail,
  sendFriendRequest,
  type FriendMatch,
} from "./actions";
import type { CircleFriend, FriendRequest, MyCircle } from "./friends-data";
import { ConfirmDialog } from "../confirm-dialog";
import { Monogram } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";
import styles from "../senior-dashboard.module.css";

/** What the search box is currently telling the person. */
type SearchState =
  | { kind: "idle" }
  | { kind: "message"; text: string }
  | { kind: "match"; match: FriendMatch };

function AddFriendCard() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await searchFriendByEmail(email);
      if (!result.ok) {
        setState({
          kind: "message",
          text:
            result.reason === "self"
              ? t("friendsSearchSelf")
              : t("friendsSearchInvalid"),
        });
        return;
      }
      // A missing account and an admin's address look identical here, which is
      // the point — search must not reveal who exists.
      setState(
        result.match
          ? { kind: "match", match: result.match }
          : { kind: "message", text: t("friendsSearchNotFound") },
      );
    } catch {
      setState({ kind: "message", text: t("friendsError") });
    } finally {
      setBusy(false);
    }
  }

  async function request(match: FriendMatch) {
    setSending(true);
    try {
      const result = await sendFriendRequest(match.id);
      if (!result.ok) {
        setState({
          kind: "message",
          text:
            result.reason === "already_friends"
              ? t("friendsAlreadyFriends", { name: match.name })
              : t("friendsError"),
        });
        return;
      }
      // The other person may have asked first, in which case this became an
      // acceptance rather than a request.
      setState({
        kind: "message",
        text:
          result.status === "accepted"
            ? t("friendsRequestAccepted", { name: match.name })
            : t("friendsRequestSent", { name: match.name }),
      });
      setEmail("");
      router.refresh();
    } catch {
      setState({ kind: "message", text: t("friendsError") });
    } finally {
      setSending(false);
    }
  }

  /** The line under a match, and whether there is anything left to do. */
  function matchStatus(match: FriendMatch) {
    switch (match.relationship) {
      case "friends":
        return t("friendsAlreadyFriends", { name: match.name });
      case "request_sent":
        return t("friendsAlreadySent", { name: match.name });
      case "request_received":
        return t("friendsAlreadyReceived", { name: match.name });
      default:
        return null;
    }
  }

  return (
    <section
      className={`${styles.settingsCard} ${styles.friendCard}`}
      aria-labelledby="add-friend-title"
    >
      <h2 id="add-friend-title">{t("friendsSearchLabel")}</h2>
      <form className={styles.friendSearchForm} onSubmit={search}>
        <input
          className={styles.settingsInput}
          type="email"
          inputMode="email"
          autoComplete="off"
          maxLength={320}
          value={email}
          placeholder={t("friendsSearchPlaceholder")}
          aria-label={t("friendsSearchLabel")}
          onChange={(event) => {
            setEmail(event.target.value);
            setState({ kind: "idle" });
          }}
        />
        <button
          className={styles.smallStartButton}
          type="submit"
          disabled={busy || !email.trim()}
        >
          <Search aria-hidden="true" />{" "}
          {busy ? t("friendsSearching") : t("friendsSearchButton")}
        </button>
      </form>

      {state.kind === "message" ? (
        <p className={styles.friendSearchNote} role="status" aria-live="polite">
          {state.text}
        </p>
      ) : null}

      {state.kind === "match" ? (
        <div className={styles.friendResult} role="status" aria-live="polite">
          <Monogram name={state.match.name} />
          <span className={styles.friendResultName}>{state.match.name}</span>
          {matchStatus(state.match) ? (
            <span className={styles.friendSearchNote}>
              {matchStatus(state.match)}
            </span>
          ) : (
            <button
              className={styles.smallStartButton}
              type="button"
              disabled={sending}
              onClick={() => request(state.match)}
            >
              <UserPlus aria-hidden="true" />{" "}
              {sending ? t("friendsSending") : t("friendsSendRequest")}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function RequestRow({
  request,
  incoming,
}: {
  request: FriendRequest;
  incoming: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function respond(accept: boolean) {
    setBusy(true);
    setError(false);
    try {
      const result = accept
        ? await acceptFriendRequest(request.id)
        : await declineFriendRequest(request.id);
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.conversationRow} ${styles.friendRow}`}>
      <span className={styles.friendMain}>
        <Monogram name={request.name} />
        <span className={styles.conversationDetails}>
          <span className={styles.conversationName}>{request.name}</span>
          {!incoming ? (
            <span className={styles.conversationMeta}>
              {t("friendsOutgoingWaiting")}
            </span>
          ) : null}
        </span>
      </span>
      <div className={styles.rowActions}>
        {incoming ? (
          <button
            className={styles.rowButton}
            type="button"
            disabled={busy}
            onClick={() => respond(true)}
          >
            <Check aria-hidden="true" /> {t("friendsAccept")}
          </button>
        ) : null}
        <button
          className={`${styles.rowButton} ${styles.rowButtonDanger}`}
          type="button"
          disabled={busy}
          onClick={() => respond(false)}
        >
          <X aria-hidden="true" />{" "}
          {incoming ? t("friendsDecline") : t("friendsCancelRequest")}
        </button>
        {error ? <span>{t("friendsError")}</span> : null}
      </div>
    </div>
  );
}

function FriendRow({
  friend,
  onRemove,
}: {
  friend: CircleFriend;
  onRemove: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className={`${styles.conversationRow} ${styles.friendRow}`}>
      <span className={styles.friendMain}>
        <Monogram name={friend.name} />
        <span className={styles.conversationDetails}>
          <span className={styles.conversationName}>{friend.name}</span>
        </span>
      </span>
      <div className={styles.rowActions}>
        <button
          className={`${styles.rowButton} ${styles.rowButtonDanger}`}
          type="button"
          onClick={onRemove}
        >
          <UserX aria-hidden="true" /> {t("friendsRemove")}
        </button>
      </div>
    </div>
  );
}

export function FriendsManager({ circle }: { circle: MyCircle }) {
  const router = useRouter();
  const { t } = useI18n();
  const [removeTarget, setRemoveTarget] = useState<CircleFriend | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(false);

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(false);
    try {
      const result = await removeFriend(removeTarget.userId);
      if (!result.ok) {
        setRemoveError(true);
        return;
      }
      setRemoveTarget(null);
      router.refresh();
    } catch {
      setRemoveError(true);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <AddFriendCard />

      {circle.incoming.length ? (
        <section className={styles.section} aria-labelledby="incoming-title">
          <div className={styles.sectionHeader}>
            <h2 id="incoming-title">{t("friendsIncomingTitle")}</h2>
          </div>
          <div className={styles.conversationTable}>
            {circle.incoming.map((request) => (
              <RequestRow request={request} incoming key={request.id} />
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="friends-title">
        <div className={styles.sectionHeader}>
          <h2 id="friends-title">{t("friendsListTitle")}</h2>
        </div>
        {circle.friends.length ? (
          <div className={styles.conversationTable}>
            {circle.friends.map((friend) => (
              <FriendRow
                friend={friend}
                onRemove={() => {
                  setRemoveError(false);
                  setRemoveTarget(friend);
                }}
                key={friend.userId}
              />
            ))}
          </div>
        ) : (
          <div className={`${styles.conversationTable} ${styles.emptyState}`}>
            <UserPlus aria-hidden="true" />
            <p>{t("friendsListEmpty")}</p>
          </div>
        )}
      </section>

      {circle.outgoing.length ? (
        <section className={styles.section} aria-labelledby="outgoing-title">
          <div className={styles.sectionHeader}>
            <h2 id="outgoing-title">{t("friendsOutgoingTitle")}</h2>
          </div>
          <div className={styles.conversationTable}>
            {circle.outgoing.map((request) => (
              <RequestRow
                request={request}
                incoming={false}
                key={request.id}
              />
            ))}
          </div>
        </section>
      ) : null}

      {removeTarget ? (
        <ConfirmDialog
          title={t("friendsRemoveTitle", { name: removeTarget.name })}
          body={t("friendsRemoveBody")}
          error={removeError ? t("friendsError") : undefined}
          cancelLabel={t("friendsRemoveCancel")}
          confirmLabel={t("friendsRemoveConfirm")}
          busy={removing}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={confirmRemove}
        />
      ) : null}
    </>
  );
}
