"use client";

import { useState } from "react";
import Link from "next/link";
import { deletePodcastUser, invitePodcastUser } from "@/app/admin/actions";
import styles from "../admin-management.module.css";

export type ManagedUser = {
  id: string;
  name: string;
  participationStatus: string | null;
  requestKind: string | null;
};

export function UserManagement({ users }: { users: ManagedUser[] }) {
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);

  return (
    <>
      <div>
        {users.length ? users.map((user) => {
          const alreadyInvited = user.participationStatus === "invited" || user.participationStatus === "accepted" || user.participationStatus === "interview_done";
          return (
            <div className={styles.userRow} key={user.id}>
              <div className={styles.identity}>
                <span className={styles.avatar}>{user.name.trim().charAt(0).toUpperCase()}</span>
                <span className={styles.name}>{user.name}</span>
              </div>
              <div className={styles.actions}>
                {user.participationStatus === "requested" && user.requestKind === "existing_conversation" ? (
                  <Link className={styles.inviteButton} href="/admin/participation">Review request</Link>
                ) : (
                  <form action={invitePodcastUser.bind(null, user.id)}>
                    <button className={styles.inviteButton} disabled={alreadyInvited}>
                      {alreadyInvited ? "Invited" : user.participationStatus === "requested" ? "Approve request" : "Invite to podcast"}
                    </button>
                  </form>
                )}
                <button className={styles.deleteButton} onClick={() => setDeleteTarget(user)}>Delete</button>
              </div>
            </div>
          );
        }) : <p className={styles.empty}>No users yet.</p>}
      </div>

      {deleteTarget ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setDeleteTarget(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="delete-user-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="delete-user-title">Delete {deleteTarget.name}?</h2>
            <p>This removes their Fireside account and access. Their completed podcast recordings will remain in the archive.</p>
            <div className={styles.modalActions}>
              <button className={styles.cancel} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <form action={deletePodcastUser.bind(null, deleteTarget.id)}>
                <button className={styles.confirm}>Delete user</button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
