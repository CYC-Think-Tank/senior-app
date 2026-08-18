import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, APP_NAME_ZH } from "@/lib/constants";
import type { Locale } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import styles from "../legal.module.css";

type LegalSection = { title: string; body: string; items?: string[] };
type PrivacyCopy = {
  eyebrow: string;
  title: string;
  effective: string;
  sections: LegalSection[];
};

const copyByLocale: Record<Locale, PrivacyCopy> = {
  en: {
    eyebrow: "Legal",
    title: "Privacy Policy",
    effective: "Effective July 27, 2026",
    sections: [
      { title: "What this covers", body: "WiseShare helps people record conversations and turn them into audio memoirs. This policy explains how we handle personal information when you use WiseShare." },
      { title: "Information we collect", body: "We collect the information needed to provide the service, which may include:", items: ["account information, such as your name and email address;", "profile details and interview preferences you choose to provide;", "audio recordings and transcripts created through WiseShare; and", "technical information needed to operate and secure the service, including authentication and session data."] },
      { title: "How we use information", body: "We use information to provide interviews and accounts, create and store recordings, protect the service, respond to requests, and send account or invitation emails. We do not sell personal information." },
      { title: "Recording, AI, and publication", body: "Before an interview begins, the storyteller is asked to consent to recording and AI processing. WiseShare uses OpenAI to run the AI interviewer. Conversations remain private unless you deliberately share a private link." },
      { title: "Service providers", body: "We use service providers to operate WiseShare, including Supabase for authentication, databases, and file storage; OpenAI for AI interview features; and Resend for invitation and account emails. They process information only as needed to provide their services to us." },
      { title: "Retention and security", body: "We keep information for as long as it is needed to provide WiseShare, meet legal obligations, resolve disputes, and enforce agreements. Unfinished public interviews are normally deleted after about 24 hours. We use reasonable safeguards appropriate to the sensitivity of the information, but no online service can guarantee absolute security." },
      { title: "Your choices", body: "You can ask to access, correct, or delete personal information, or withdraw consent for future processing where applicable. To make a request, contact the WiseShare organization that invited you using the contact details in your invitation. Withdrawing consent does not affect processing already completed or information we must retain by law." },
      { title: "Changes to this policy", body: "We may update this policy as WiseShare changes. We will post the updated version here and revise the effective date." },
    ],
  },
  "zh-Hans": {
    eyebrow: "法律信息",
    title: "隐私政策",
    effective: "生效日期：2026 年 7 月 27 日",
    sections: [
      { title: "本政策的适用范围", body: "慧享帮助用户录制对话并制作有声回忆录。本政策说明您使用慧享时，我们如何处理个人信息。" },
      { title: "我们收集的信息", body: "我们会收集提供服务所需的信息，其中可能包括：", items: ["账户信息，例如您的姓名和电子邮箱；", "您自愿提供的个人资料及访谈偏好；", "通过慧享创建的录音和文字记录；以及", "运营和保护服务所需的技术信息，包括身份验证和会话数据。"] },
      { title: "我们如何使用信息", body: "我们使用这些信息来提供访谈和账户服务、创建及保存录音、保护服务、回应请求，以及发送账户或邀请邮件。我们不会出售个人信息。" },
      { title: "录音、AI 与发布", body: "访谈开始前，我们会请讲述者同意录音及 AI 处理。慧享使用 OpenAI 提供 AI 访谈功能。除非您主动分享私密链接，否则对话始终保持私密。" },
      { title: "服务提供商", body: "我们使用服务提供商来运营慧享，包括用于身份验证、数据库和文件存储的 Supabase，用于 AI 访谈功能的 OpenAI，以及用于邀请和账户邮件的 Resend。这些服务商仅在为我们提供服务所需的范围内处理信息。" },
      { title: "保存期限与安全", body: "我们会在提供慧享服务、履行法律义务、解决争议和执行协议所需的期限内保留信息。未完成的公开访谈通常会在约 24 小时后删除。我们会根据资料的敏感程度采取合理保护措施，但任何在线服务都无法保证绝对安全。" },
      { title: "您的选择", body: "在适用情况下，您可以申请访问、更正或删除个人信息，也可以撤回对未来处理的同意。如需提出请求，请使用邀请中的联系方式与邀请您使用慧享的机构联系。撤回同意不会影响已经完成的处理，也不会影响我们依法必须保留的信息。" },
      { title: "政策变更", body: "随着慧享的变化，我们可能更新本政策。更新后的版本会发布在本页面，并注明新的生效日期。" },
    ],
  },
  "zh-Hant": {
    eyebrow: "法律資訊",
    title: "私隱政策",
    effective: "生效日期：2026 年 7 月 27 日",
    sections: [
      { title: "本政策的適用範圍", body: "慧享協助使用者錄製對話並製作有聲回憶錄。本政策說明您使用慧享時，我們如何處理個人資料。" },
      { title: "我們收集的資料", body: "我們會收集提供服務所需的資料，其中可能包括：", items: ["帳戶資料，例如您的姓名和電子郵件；", "您自願提供的個人資料及訪談偏好；", "透過慧享建立的錄音和逐字稿；以及", "營運和保護服務所需的技術資料，包括身分驗證和工作階段資料。"] },
      { title: "我們如何使用資料", body: "我們使用這些資料來提供訪談和帳戶服務、建立及儲存錄音、保護服務、回應要求，以及傳送帳戶或邀請郵件。我們不會出售個人資料。" },
      { title: "錄音、AI 與發布", body: "訪談開始前，我們會請講述者同意錄音及 AI 處理。慧享使用 OpenAI 提供 AI 訪談功能。除非您主動分享私人連結，否則對話會保持私密。" },
      { title: "服務供應商", body: "我們使用服務供應商來營運慧享，包括用於身分驗證、資料庫和檔案儲存的 Supabase，用於 AI 訪談功能的 OpenAI，以及用於邀請和帳戶郵件的 Resend。這些供應商只會在向我們提供服務所需的範圍內處理資料。" },
      { title: "保留期限與安全", body: "我們會在提供慧享服務、履行法律責任、解決爭議和執行協議所需的期間保留資料。未完成的公開訪談通常會在約 24 小時後刪除。我們會根據資料的敏感程度採取合理保障措施，但任何網上服務都無法保證絕對安全。" },
      { title: "您的選擇", body: "在適用情況下，您可以要求查閱、更正或刪除個人資料，也可以撤回對日後處理的同意。如需提出要求，請使用邀請中的聯絡資料與邀請您使用慧享的機構聯絡。撤回同意不會影響已完成的處理，也不會影響我們依法必須保留的資料。" },
      { title: "政策變更", body: "隨著慧享的變化，我們可能更新本政策。更新後的版本會發布在本頁，並註明新的生效日期。" },
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getPreferredLocale();
  return { title: copyByLocale[locale].title };
}

export default async function PrivacyPage() {
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
              {section.items ? (
                <ul>
                  {section.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
