"use client";

import { useState } from "react";
import { deleteUser } from "@/app/admin/actions";
import { useI18n } from "@/components/i18n-provider";
import styles from "../admin-management.module.css";

export type ManagedUser = {
  id: string;
  name: string;
};

export function UserManagement({ users }: { users: ManagedUser[] }) {
  const { locale } = useI18n();
  const copy = locale === "en"
    ? { delete: "Delete", empty: "No users yet.", title: (name: string) => `Delete ${name}?`, body: "This removes their WiseShare account and access. Their recorded conversations will remain.", cancel: "Cancel", confirm: "Delete user" }
    : locale === "zh-Hans"
      ? { delete: "删除", empty: "还没有用户。", title: (name: string) => `删除 ${name}？`, body: "这会移除其慧享账户和访问权限，但已录制的对话会保留。", cancel: "取消", confirm: "删除用户" }
      : { delete: "刪除", empty: "還沒有使用者。", title: (name: string) => `刪除 ${name}？`, body: "這會移除其慧享帳戶和存取權限，但已錄製的對話會保留。", cancel: "取消", confirm: "刪除使用者" };
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);

  return (
    <>
      <div>
        {users.length ? users.map((user) => (
          <div className={styles.userRow} key={user.id}>
            <div className={styles.identity}>
              <span className={styles.avatar}>{user.name.trim().charAt(0).toUpperCase()}</span>
              <span className={styles.name}>{user.name}</span>
            </div>
            <div className={styles.actions}>
              <button className={styles.deleteButton} onClick={() => setDeleteTarget(user)}>{copy.delete}</button>
            </div>
          </div>
        )) : <p className={styles.empty}>{copy.empty}</p>}
      </div>

      {deleteTarget ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setDeleteTarget(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="delete-user-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="delete-user-title">{copy.title(deleteTarget.name)}</h2>
            <p>{copy.body}</p>
            <div className={styles.modalActions}>
              <button className={styles.cancel} onClick={() => setDeleteTarget(null)}>{copy.cancel}</button>
              <form action={deleteUser.bind(null, deleteTarget.id)}>
                <button className={styles.confirm}>{copy.confirm}</button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
