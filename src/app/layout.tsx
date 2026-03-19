import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/contexts/toast-context";
import { ToastContainer } from "@/components/toast-container";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SMSHub — Multi-platform SMS Messaging",
  description:
    "Send and receive SMS from any device. Multi-provider support with Twilio, Telnyx, and real SIM numbers. Built for developers, designed for everyone.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SMSHub",
  },
  openGraph: {
    title: "SMSHub — Multi-platform SMS Messaging",
    description:
      "One inbox for all your SMS. Web, iOS, Android, desktop. Multi-provider support with developer-first API.",
    url: "https://smshub.dev",
    siteName: "SMSHub",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SMSHub — Multi-platform SMS Messaging",
    description:
      "One inbox for all your SMS. Web, iOS, Android, desktop. Multi-provider support with developer-first API.",
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
          <main className="flex-1">{children}</main>
          <Footer />
          <ToastContainer />
          <ServiceWorkerRegister />
        </ToastProvider>
      </body>
    </html>
  );
}
