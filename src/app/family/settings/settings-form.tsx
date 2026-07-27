"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Save } from "lucide-react";
import { updateMyProfile } from "../actions";
import { useI18n } from "@/components/i18n-provider";
import styles from "../senior-dashboard.module.css";

export function SettingsForm({
  name,
  bio,
  email,
}: {
  name: string;
  bio: string;
  email: string;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const chinese = locale !== "en";
  const [nameValue, setNameValue] = useState(name);
  const [bioValue, setBioValue] = useState(bio);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(false);
    try {
      const result = await updateMyProfile(nameValue, bioValue);
      if (!result.ok) {
        setError(true);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.settingsCard} onSubmit={save}>
      <div className={styles.settingsField}>
        <label htmlFor="settings-name">{chinese ? "您的名字" : "Your name"}</label>
        <input
          id="settings-name"
          className={styles.settingsInput}
          value={nameValue}
          maxLength={80}
          placeholder={email.split("@")[0]}
          autoComplete="name"
          onChange={(event) => {
            setNameValue(event.target.value);
            setSaved(false);
          }}
        />
        <p className={styles.settingsHint}>
          {chinese
            ? "Rosie 会这样称呼您，家人也会在录音列表里看到这个名字。"
            : "Rosie calls you by this name, and your family sees it on your recordings."}
        </p>
      </div>

      <div className={styles.settingsField}>
        <label htmlFor="settings-bio">{chinese ? "关于您" : "About you"}</label>
        <textarea
          id="settings-bio"
          className={styles.settingsTextarea}
          value={bioValue}
          maxLength={1000}
          rows={6}
          placeholder={
            chinese
              ? "例如：我在广州长大，做了三十年老师，有两个孙子。"
              : "For example: I grew up in Guangzhou, taught school for thirty years, and have two grandchildren."
          }
          onChange={(event) => {
            setBioValue(event.target.value);
            setSaved(false);
          }}
        />
        <p className={styles.settingsHint}>
          {chinese
            ? "写下几句关于您的生活。知道得越多，Rosie 的问题就越贴近您。"
            : "A few sentences about your life. The more Rosie knows, the better her questions will be."}
        </p>
      </div>

      <div className={styles.settingsActions}>
        <button className={styles.requestPrimaryButton} type="submit" disabled={busy}>
          <Save aria-hidden="true" />
          {busy ? (chinese ? "正在保存…" : "Saving…") : chinese ? "保存" : "Save changes"}
        </button>
        <p aria-live="polite" className={styles.settingsStatus}>
          {saved ? (
            <>
              <Check aria-hidden="true" /> {chinese ? "已保存" : "Saved"}
            </>
          ) : null}
        </p>
      </div>
      {error ? (
        <p className={styles.requestError}>
          {chinese ? "无法保存，请重试。" : "Could not save your changes. Please try again."}
        </p>
      ) : null}
    </form>
  );
}
