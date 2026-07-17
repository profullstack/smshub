import type { Metadata, Viewport } from "next";
import { ReferralProvider } from '@profullstack/referrals/react';
import { FeedbackWidget } from "@profullstack/stack/feedback";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/contexts/toast-context";
import { ToastContainer } from "@/components/toast-container";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getSiteUrl } from "@/lib/site-url";

const inter = Inter({ subsets: ["latin"] });
const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SMSHub — Multi-platform SMS Messaging",
  description:
    "Send and receive SMS from any device. Multi-provider support with Twilio, Telnyx, and real SIM numbers. Built for developers, designed for everyone.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon.ico", rel: "shortcut icon" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-180x180.png", sizes: "180x180" },
      { url: "/icons/apple-touch-icon-152x152.png", sizes: "152x152" },
      { url: "/icons/apple-touch-icon-144x144.png", sizes: "144x144" },
      { url: "/icons/apple-touch-icon-120x120.png", sizes: "120x120" },
      { url: "/icons/apple-touch-icon-114x114.png", sizes: "114x114" },
      { url: "/icons/apple-touch-icon-76x76.png", sizes: "76x76" },
      { url: "/icons/apple-touch-icon-72x72.png", sizes: "72x72" },
      { url: "/icons/apple-touch-icon-60x60.png", sizes: "60x60" },
      { url: "/icons/apple-touch-icon-57x57.png", sizes: "57x57" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SMSHub",
  },
  other: {
    "msapplication-TileColor": "#030712",
    "msapplication-config": "/browserconfig.xml",
    "msapplication-TileImage": "/icons/apple-touch-icon-144x144.png",
  },
  openGraph: {
    title: "SMSHub — Multi-platform SMS Messaging",
    description:
      "One inbox for all your SMS. Web, iOS, Android, desktop. Multi-provider support with developer-first API.",
    url: siteUrl,
    siteName: "SMSHub",
    type: "website",
    images: [
      {
        url: "/icons/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "SMSHub",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SMSHub — Multi-platform SMS Messaging",
    description:
      "One inbox for all your SMS. Web, iOS, Android, desktop. Multi-provider support with developer-first API.",
    images: ["/icons/icon-512x512.png"],
  },
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  themeColor: "#030712",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen flex flex-col`}
      >
        <ToastProvider>
          <Header />
          <main className="flex-1"><ReferralProvider>{children}</ReferralProvider></main>
          <Footer />
          <ToastContainer />
          <ServiceWorkerRegister />
        </ToastProvider>
      <FeedbackWidget property="smshub.com" />
      </body>
    </html>
  );
}
