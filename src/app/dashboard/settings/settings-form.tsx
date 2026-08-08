"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Save } from "lucide-react";
import { updateMyProfile } from "../actions";
import { useI18n } from "@/components/i18n-provider";
import { REALTIME_VOICE, REALTIME_VOICES } from "@/lib/constants";
import styles from "../senior-dashboard.module.css";

/**
 * The API's voice names are bare lowercase identifiers. Only their casing is
 * adjusted — inventing descriptions of how each one sounds would be guesswork.
 */
function voiceLabel(voice: string) {
  return voice.charAt(0).toUpperCase() + voice.slice(1);
}

export function SettingsForm({
  name,
  bio,
  voice,
  email,
}: {
  name: string;
  bio: string;
  voice: string;
  email: string;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const chinese = locale !== "en";
  const [nameValue, setNameValue] = useState(name);
  const [bioValue, setBioValue] = useState(bio);
  const [voiceValue, setVoiceValue] = useState(voice);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(false);
    try {
      const result = await updateMyProfile(nameValue, bioValue, voiceValue);
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

      <div className={styles.settingsField}>
        <label htmlFor="settings-voice">{chinese ? "Rosie 的声音" : "Rosie’s voice"}</label>
        <select
          id="settings-voice"
          className={styles.settingsSelect}
          value={voiceValue}
          onChange={(event) => {
            setVoiceValue(event.target.value);
            setSaved(false);
          }}
        >
          {REALTIME_VOICES.map((option) => (
            <option value={option} key={option}>
              {voiceLabel(option)}
              {option === REALTIME_VOICE
                ? chinese ? "（默认）" : " (default)"
                : ""}
            </option>
          ))}
        </select>
        <p className={styles.settingsHint}>
          {chinese
            ? "下次对话开始时生效。对话进行中无法更换声音。"
            : "Takes effect the next time a conversation starts. The voice cannot change partway through one."}
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
        <p className={styles.settingsError}>
          {chinese ? "无法保存，请重试。" : "Could not save your changes. Please try again."}
        </p>
      ) : null}
    </form>
  );
}
