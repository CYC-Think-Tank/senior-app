import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, APP_NAME_ZH } from "@/lib/constants";
import type { Locale } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import styles from "../legal.module.css";

type TermsCopy = {
  eyebrow: string;
  title: string;
  effective: string;
  sections: { title: string; body: string }[];
};

const copyByLocale: Record<Locale, TermsCopy> = {
  en: {
    eyebrow: "Legal", title: "Terms of Use", effective: "Effective July 27, 2026",
    sections: [
      { title: "Using WiseShare", body: "WiseShare is a service for recording and sharing personal stories. Use it lawfully and only with the permission of everyone whose voice or personal information is included in a recording." },
      { title: "Your content and permissions", body: "You are responsible for the information and recordings you provide. Do not upload or record material that infringes another person’s rights, is unlawful, or contains another person’s private information without their permission." },
      { title: "Publication choices", body: "A recording is never public. It is shared only when someone with access deliberately creates a private share link, and those links should be sent only to people you trust." },
      { title: "Accounts and availability", body: "Keep your account credentials secure and tell us promptly if you believe someone has accessed your account without permission. WiseShare may change, suspend, or discontinue features when necessary to operate, secure, or improve the service." },
      { title: "Contact and changes", body: "Questions about these terms can be directed to the WiseShare organization that invited you. We may update these terms from time to time by posting the updated version on this page." },
    ],
  },
  "zh-Hans": {
    eyebrow: "法律信息", title: "使用条款", effective: "生效日期：2026 年 7 月 27 日",
    sections: [
      { title: "使用仁慧享", body: "仁慧享是一项用于录制和分享个人故事的服务。请依法使用，并确保录音中所有声音或个人信息的相关人士都已同意。" },
      { title: "您的内容与授权", body: "您应对所提供的信息和录音负责。请勿上传或录制侵犯他人权利、违反法律，或未经同意包含他人私密信息的内容。" },
      { title: "分享选择", body: "录音不会公开发布。只有有权访问的人主动创建私密分享链接时，录音才会被分享；这些链接只应发送给您信任的人。" },
      { title: "账户与服务可用性", body: "请妥善保管账户凭证。如果您认为有人未经许可访问了您的账户，请立即通知我们。为了运营、保护或改善服务，仁慧享可能在必要时更改、暂停或停止某些功能。" },
      { title: "联系与条款变更", body: "如对本条款有疑问，请联系邀请您使用仁慧享的机构。我们可能不时更新本条款，并将更新后的版本发布在本页面。" },
    ],
  },
  "zh-Hant": {
    eyebrow: "法律資訊", title: "使用條款", effective: "生效日期：2026 年 7 月 27 日",
    sections: [
      { title: "使用仁慧享", body: "仁慧享是一項用於錄製和分享個人故事的服務。請合法使用，並確保錄音中所有聲音或個人資料的相關人士都已同意。" },
      { title: "您的內容與授權", body: "您須對所提供的資料和錄音負責。請勿上載或錄製侵犯他人權利、違反法律，或未經同意包含他人私人資料的內容。" },
      { title: "分享選擇", body: "錄音不會公開發布。只有獲授權存取的人主動建立私人分享連結時，錄音才會被分享；這些連結只應傳送給您信任的人。" },
      { title: "帳戶與服務可用性", body: "請妥善保管帳戶憑證。如果您認為有人未經許可存取您的帳戶，請立即通知我們。為了營運、保護或改善服務，仁慧享可能在必要時更改、暫停或停止某些功能。" },
      { title: "聯絡與條款變更", body: "如對本條款有疑問，請聯絡邀請您使用仁慧享的機構。我們可能不時更新本條款，並將更新後的版本發布在本頁。" },
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getPreferredLocale();
  return { title: copyByLocale[locale].title };
}

export default async function TermsPage() {
  const locale = await getPreferredLocale();
  const copy = copyByLocale[locale];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.home} href="/">
          ← {locale === "en" ? APP_NAME : APP_NAME_ZH}
        </Link>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.updated}>{copy.effective}</p>

        <article className={styles.content}>
          {copy.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
