"use client";

import { createGuest } from "@/app/admin/actions";
import { Card, buttonStyles, inputStyles } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";

export default function NewGuestPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-serif text-3xl font-semibold">
        {t("commonNewGuest")}
      </h1>
      <p className="mt-1 text-ink-soft">{t("guestNewIntro")}</p>

      <Card className="mt-6 p-8">
        <form action={createGuest} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              {t("guestName")}
            </label>
            <input
              name="name"
              required
              placeholder={t("guestNamePlaceholder")}
              className={inputStyles}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              {t("guestAbout")}
            </label>
            <textarea
              name="bio"
              rows={3}
              placeholder={t("guestAboutPlaceholder")}
              className={inputStyles}
            />
            <p className="mt-1 text-xs text-ink-faint">
              {t("guestAboutHelp")}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              {t("guestSubjects")}
            </label>
            <input
              name="topics"
              placeholder={t("guestSubjectsPlaceholder")}
              className={inputStyles}
            />
            <p className="mt-1 text-xs text-ink-faint">
              {t("guestSubjectsHelp")}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              {t("guestLanguage")}
            </label>
            <input
              name="language"
              defaultValue={t("guestLanguageDefault")}
              className={inputStyles}
            />
          </div>
          <button type="submit" className={`${buttonStyles.primary} w-full`}>
            {t("guestCreate")}
          </button>
        </form>
      </Card>
    </div>
  );
}
