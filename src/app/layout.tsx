import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  Geist,
  Playfair_Display,
} from "next/font/google";
import { APP_NAME, TAGLINE } from "@/lib/constants";
import { I18nProvider } from "@/components/i18n-provider";
import { InterviewAtmosphere } from "@/components/interview-atmosphere";
import { PageEntrance } from "@/components/page-entrance";
import {
  translate,
} from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || headerStore.get("host");
  const forwardedProtocol = headerStore.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol?.split(",")[0]?.trim() ||
    (host?.startsWith("localhost") ? "http" : "https");
  const socialImage = host ? `${protocol}://${host}/og.png` : undefined;
  const title = `${APP_NAME} — ${TAGLINE}`;
  const description = translate("en", "appDescription");

  return {
    title: {
      default: title,
      template: `%s · ${APP_NAME}`,
    },
    description,
    openGraph: {
      type: "website",
      title,
      description,
      images: socialImage
        ? [
            {
              url: socialImage,
              width: 1731,
              height: 909,
              alt: `${APP_NAME} — ${TAGLINE}`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: socialImage ? [socialImage] : undefined,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getPreferredLocale();

  return (
    <html
      lang={locale}
      className={`${playfair.variable} ${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <InterviewAtmosphere />
        <I18nProvider locale={locale}>
          <div data-language-page className="contents">
            <PageEntrance>{children}</PageEntrance>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
