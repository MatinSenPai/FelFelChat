import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { Sora, Vazirmatn } from "next/font/google";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FelFel Chat",
  description: "Secure and modern real-time messaging",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className={`${vazirmatn.variable} ${sora.variable}`}
        style={{ fontFamily: "var(--font-vazirmatn), var(--font-sora), sans-serif" }}
      >
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
