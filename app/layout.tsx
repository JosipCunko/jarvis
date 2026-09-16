import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import AuthProvider from "@/app/_components/AuthProvider";
import { AppToaster } from "@/app/_components/notify";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/app/_lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-hud font-sans text-ink">
        <AuthProvider>
          {children}
          <AppToaster />
        </AuthProvider>
      </body>
    </html>
  );
}
