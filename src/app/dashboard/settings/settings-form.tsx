"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Save } from "lucide-react";
import { updateMyProfile } from "../actions";
import { useI18n } from "@/components/i18n-provider";
import { REALTIME_VOICE, REALTIME_VOICES } from "@/lib/constants";
import type { Locale } from "@/lib/i18n";
import styles from "../senior-dashboard.module.css";

/**
 * The API's voice names are bare lowercase identifiers. Only their casing is
 * adjusted — inventing descriptions of how each one sounds would be guesswork.
 */
function voiceLabel(voice: string) {
  return voice.charAt(0).toUpperCase() + voice.slice(1);
}

const copyByLocale: Record<Locale, {
  name: string;
  nameHint: string;
  bio: string;
  bioPlaceholder: string;
  bioHint: string;
  voice: string;
  defaultVoice: string;
  voiceHint: string;
  saving: string;
  save: string;
  saved: string;
  error: string;
}> = {
  en: {
    name: "Your name",
    nameHint: "Rosie calls you by this name, and your family sees it on your recordings.",
    bio: "About you",
    bioPlaceholder: "For example: I grew up in Guangzhou, taught school for thirty years, and have two grandchildren.",
    bioHint: "A few sentences about your life. The more Rosie knows, the better her questions will be.",
    voice: "Rosie’s voice",
    defaultVoice: " (default)",
    voiceHint: "Takes effect the next time a conversation starts. The voice cannot change partway through one.",
    saving: "Saving…",
    save: "Save changes",
    saved: "Saved",
    error: "Could not save your changes. Please try again.",
  },
  "zh-Hans": {
    name: "您的名字",
    nameHint: "Rosie 会这样称呼您，家人也会在录音列表里看到这个名字。",
    bio: "关于您",
    bioPlaceholder: "例如：我在广州长大，做了三十年老师，有两个孙子。",
    bioHint: "写下几句关于您的生活。知道得越多，Rosie 的问题就越贴近您。",
    voice: "Rosie 的声音",
    defaultVoice: "（默认）",
    voiceHint: "下次对话开始时生效。对话进行中无法更换声音。",
    saving: "正在保存…",
    save: "保存",
    saved: "已保存",
    error: "无法保存，请重试。",
  },
  "zh-Hant": {
    name: "您的名字",
    nameHint: "Rosie 會這樣稱呼您，家人也會在錄音列表裡看到這個名字。",
    bio: "關於您",
    bioPlaceholder: "例如：我在廣州長大，做了三十年老師，有兩個孫子。",
    bioHint: "寫下幾句關於您的生活。知道得越多，Rosie 的問題就越貼近您。",
    voice: "Rosie 的聲音",
    defaultVoice: "（預設）",
    voiceHint: "下次對話開始時生效。對話進行中無法更換聲音。",
    saving: "正在儲存…",
    save: "儲存",
    saved: "已儲存",
    error: "無法儲存，請重試。",
  },
};

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
  const copy = copyByLocale[locale];
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
        <label htmlFor="settings-name">{copy.name}</label>
        <input
          id="settings-name"
          className={`${styles.settingsInput} ${styles.settingsControl}`}
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
          {copy.nameHint}
        </p>
      </div>

      <div className={styles.settingsField}>
        <label htmlFor="settings-bio">{copy.bio}</label>
        <textarea
          id="settings-bio"
          className={`${styles.settingsTextarea} ${styles.settingsControl}`}
          value={bioValue}
          maxLength={1000}
          rows={6}
          placeholder={copy.bioPlaceholder}
          onChange={(event) => {
            setBioValue(event.target.value);
            setSaved(false);
          }}
        />
        <p className={styles.settingsHint}>
          {copy.bioHint}
        </p>
      </div>

      <div className={styles.settingsField}>
        <label htmlFor="settings-voice">{copy.voice}</label>
        <select
          id="settings-voice"
          className={`${styles.settingsSelect} ${styles.settingsControl}`}
          value={voiceValue}
          onChange={(event) => {
            setVoiceValue(event.target.value);
            setSaved(false);
          }}
        >
          {REALTIME_VOICES.map((option) => (
            <option value={option} key={option}>
              {voiceLabel(option)}
              {option === REALTIME_VOICE ? copy.defaultVoice : ""}
            </option>
          ))}
        </select>
        <p className={styles.settingsHint}>
          {copy.voiceHint}
        </p>
      </div>

      <div className={styles.settingsActions}>
        <button className={styles.settingsSaveButton} type="submit" disabled={busy}>
          <Save aria-hidden="true" />
          {busy ? copy.saving : copy.save}
        </button>
        <p aria-live="polite" className={styles.settingsStatus}>
          {saved ? (
            <>
              <Check aria-hidden="true" /> {copy.saved}
            </>
          ) : null}
        </p>
      </div>
      {error ? (
        <p className={styles.settingsError}>
          {copy.error}
        </p>
      ) : null}
    </form>
  );
}
