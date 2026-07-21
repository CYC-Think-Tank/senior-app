"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Headphones, Mic, Radio, Send } from "lucide-react";
import {
  acceptPodcastInvitation,
  requestPodcastParticipation,
} from "../actions";
import type { FamilyConversation } from "../family-data";
import { useI18n } from "@/components/i18n-provider";
import styles from "../senior-dashboard.module.css";

type Participation = {
  status: string;
  requestKind: "existing_conversation" | "new_interview";
  sessionId: string | null;
  interviewToken: string | null;
};

export function PodcastRequestPanel({
  conversations,
  participation,
}: {
  conversations: FamilyConversation[];
  participation: Participation | null;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const chinese = locale !== "en";
  const [choice, setChoice] = useState<"existing_conversation" | "new_interview" | null>(null);
  const [selectedSession, setSelectedSession] = useState(conversations[0]?.id ?? "");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function submitRequest() {
    if (choice === "existing_conversation" && !selectedSession) {
      setError(true);
      return;
    }
    if (!choice) return;
    setError(false);
    startTransition(async () => {
      try {
        const result = await requestPodcastParticipation(choice, selectedSession || undefined);
        if (!result.ok) {
          setError(true);
          return;
        }
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  if (participation) {
    const selected = conversations.find((conversation) => conversation.id === participation.sessionId);
    if (participation.status === "invited") {
      return (
        <section className={styles.requestStatusCard}>
          <Radio aria-hidden="true" />
          <div>
            <p className={styles.eyebrow}>{chinese ? "邀请已准备好" : "Your invitation is ready"}</p>
            <h2>{chinese ? "准备好开始播客访谈了吗？" : "Ready to begin your podcast interview?"}</h2>
            <p>{chinese ? "接受邀请后，Rosie 会带您开始新的访谈。" : "Accept the invitation and Rosie will guide you through a new interview."}</p>
          </div>
          <form action={acceptPodcastInvitation}>
            <button className={styles.requestPrimaryButton} type="submit">
              <Mic aria-hidden="true" /> {chinese ? "接受并开始" : "Accept and start"}
            </button>
          </form>
        </section>
      );
    }

    if (participation.status === "accepted" && participation.interviewToken) {
      return (
        <section className={styles.requestStatusCard}>
          <Radio aria-hidden="true" />
          <div>
            <h2>{chinese ? "您的访谈正在等待" : "Your interview is waiting"}</h2>
            <p>{chinese ? "准备好后，可以从上次的位置继续。" : "Continue whenever you feel ready."}</p>
          </div>
          <Link className={styles.requestPrimaryButton} href={`/interview/${participation.interviewToken}`}>
            {chinese ? "继续访谈" : "Continue interview"}
          </Link>
        </section>
      );
    }

    return (
      <section className={styles.requestStatusCard}>
        <CheckCircle2 aria-hidden="true" />
        <div>
          <p className={styles.eyebrow}>
            {participation.status === "interview_done"
              ? chinese ? "已完成" : "Complete"
              : chinese ? "申请已发送" : "Request sent"}
          </p>
          <h2>
            {participation.requestKind === "existing_conversation"
              ? chinese ? "您的录音已发送给播客团队" : "Your recording was sent to the podcast team"
              : chinese ? "我们已收到您的新访谈申请" : "We received your request for a new interview"}
          </h2>
          <p>
            {selected
              ? chinese ? `已选择：${selected.name}` : `Selected: ${selected.name}`
              : chinese ? "管理员会审核您的申请并与您联系。" : "An administrator will review your request and follow up with you."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.requestBuilder}>
      <div>
        <p className={styles.eyebrow}>{chinese ? "第一步" : "Step one"}</p>
        <h2>{chinese ? "您想分享什么？" : "What would you like to share?"}</h2>
        <p className={styles.requestLead}>
          {chinese
            ? "您可以发送已有录音，也可以申请一次全新的播客访谈。"
            : "Choose a conversation you already recorded, or request a brand-new podcast interview."}
        </p>
      </div>

      <div className={styles.requestChoices}>
        <button
          className={`${styles.requestChoice} ${choice === "existing_conversation" ? styles.requestChoiceActive : ""}`}
          type="button"
          disabled={!conversations.length}
          onClick={() => setChoice("existing_conversation")}
        >
          <Headphones aria-hidden="true" />
          <strong>{chinese ? "分享已有对话" : "Share an existing conversation"}</strong>
          <span>
            {conversations.length
              ? chinese ? "从您的录音中选择一个。" : "Choose one from your saved recordings."
              : chinese ? "您还没有可以选择的录音。" : "You do not have a recording to choose yet."}
          </span>
        </button>
        <button
          className={`${styles.requestChoice} ${choice === "new_interview" ? styles.requestChoiceActive : ""}`}
          type="button"
          onClick={() => setChoice("new_interview")}
        >
          <Mic aria-hidden="true" />
          <strong>{chinese ? "申请新访谈" : "Request a new interview"}</strong>
          <span>{chinese ? "管理员会为您准备一个新的播客访谈。" : "An administrator will prepare a new podcast interview for you."}</span>
        </button>
      </div>

      {choice === "existing_conversation" ? (
        <div className={styles.requestSelection}>
          <label htmlFor="podcast-conversation">
            {chinese ? "选择要发送的对话" : "Choose the conversation to send"}
          </label>
          <select
            id="podcast-conversation"
            value={selectedSession}
            onChange={(event) => setSelectedSession(event.target.value)}
          >
            {conversations.map((conversation) => (
              <option value={conversation.id} key={conversation.id}>{conversation.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {choice ? (
        <button className={styles.requestPrimaryButton} type="button" disabled={pending} onClick={submitRequest}>
          <Send aria-hidden="true" />
          {pending ? (chinese ? "正在发送…" : "Sending…") : chinese ? "发送申请" : "Send request"}
        </button>
      ) : null}
      {error ? <p className={styles.requestError}>{chinese ? "无法发送申请，请重试。" : "Could not send your request. Please try again."}</p> : null}
    </section>
  );
}
