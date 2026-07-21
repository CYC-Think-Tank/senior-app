"use client";

import { useState } from "react";
import Link from "next/link";
import { acceptPodcastInvitation, requestPodcastInvitation } from "./actions";
import styles from "./podcast-invitation.module.css";

type Props = {
  status: string | null;
  interviewToken: string | null;
  copy: {
    title: string;
    body: string;
    request: string;
    requested: string;
    invitedTitle: string;
    invitedBody: string;
    start: string;
    later: string;
    continue: string;
    complete: string;
  };
};

export function PodcastInvitation({ status, interviewToken, copy }: Props) {
  const [showInvitation, setShowInvitation] = useState(status === "invited");

  return (
    <>
      <section className={styles.requestCard}>
        <div><h2>{copy.title}</h2><p>{copy.body}</p></div>
        {!status ? (
          <form action={requestPodcastInvitation}><button className={styles.requestButton}>{copy.request}</button></form>
        ) : status === "requested" ? (
          <span className={styles.status}><span className={styles.statusDot} />{copy.requested}</span>
        ) : status === "accepted" && interviewToken ? (
          <Link className={styles.continueLink} href={`/interview/${interviewToken}`}>{copy.continue}</Link>
        ) : status === "interview_done" ? (
          <span className={styles.status}><span className={styles.statusDot} />{copy.complete}</span>
        ) : null}
      </section>

      {showInvitation ? (
        <aside className={styles.popup} role="dialog" aria-modal="false" aria-labelledby="podcast-invite-title">
          <p className={styles.popupKicker}>{copy.title}</p>
          <h2 id="podcast-invite-title">{copy.invitedTitle}</h2>
          <p className={styles.popupCopy}>{copy.invitedBody}</p>
          <div className={styles.popupActions}>
            <form action={acceptPodcastInvitation}><button className={styles.acceptButton}>{copy.start}</button></form>
            <button className={styles.dismiss} onClick={() => setShowInvitation(false)}>{copy.later}</button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
