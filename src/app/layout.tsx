import type { Metadata, Viewport } from "next";
import { ReferralProvider } from '@profullstack/referrals/react';
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/contexts/toast-context";
import { ToastContainer } from "@/components/toast-container";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Footer as PfsFooter } from "@profullstack/footer/react";
import { PitFooter } from "@/components/pit-footer";
import { getSiteUrl } from "@/lib/site-url";
import { priceUsdPerMonth } from "@/lib/plans";
import { getBrand } from "@/lib/brand-server";
import type { Brand } from "@/lib/brand";
import { BrandProvider } from "@/contexts/brand-context";
import { StationChrome } from "@/components/station/chrome";
import { AdUnit } from "@/components/ad-unit";

const inter = Inter({ subsets: ["latin"] });
const stationDisplay = Space_Grotesk({ subsets: ["latin"], variable: "--font-station-display" });
const stationMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-station-mono" });
const siteUrl = getSiteUrl();
const price = priceUsdPerMonth();

const smshubMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SMSHub: rent a US number for SMS verification codes",
  description:
    `Rent a real US phone number for $${price}/month and receive SMS and one-time verification codes in your inbox, by API, CLI or MCP. Pay with crypto, or bring your own Twilio or Telnyx number for free.`,
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
    title: "SMSHub: rent a US number for SMS verification codes",
    description:
      `Rent a real US phone number for $${price}/month and receive SMS verification codes in your inbox, by API, CLI or MCP. Pay with crypto.`,
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
    title: "SMSHub: rent a US number for SMS verification codes",
    description:
      `Rent a real US phone number for $${price}/month and receive SMS verification codes in your inbox, by API, CLI or MCP. Pay with crypto.`,
    images: ["/icons/icon-512x512.png"],
  },
  alternates: {
    canonical: "/",
  },
};

function brandMetadata(brand: Brand): Metadata {
  if (brand.id === "smshub") return smshubMetadata;
  const icon = (size: number) => `${brand.assetBase}/icon-${size}.png`;
  return {
    metadataBase: new URL(siteUrl),
    title: { default: brand.title, template: `%s · ${brand.name}` },
    description: brand.description,
    applicationName: brand.name,
    manifest: brand.manifest,
    icons: {
      icon: [
        { url: brand.favicon, type: "image/svg+xml" },
        { url: icon(192), sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: `${brand.assetBase}/apple-touch-icon.png`, sizes: "180x180" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: brand.shortName,
    },
    formatDetection: { telephone: false },
    openGraph: {
      title: brand.title,
      description: brand.description,
      siteName: brand.name,
      type: "website",
      images: [{ url: `${brand.assetBase}/og.png`, width: 1200, height: 630, alt: brand.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: brand.title,
      description: brand.description,
      images: [`${brand.assetBase}/og.png`],
    },
    // Each brand is its own site, so no canonical pointing at another host.
    alternates: { canonical: "/" },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata(await getBrand());
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await getBrand();
  return {
    themeColor: brand.themeColor,
    width: "device-width",
    initialScale: 1,
    // The station app draws under the notch and pads with safe-area insets.
    ...(brand.id === "smshub" ? {} : { viewportFit: "cover" as const }),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = await getBrand();

  if (brand.id !== "smshub") {
    return (
      <html lang="en" className={`dark ${stationDisplay.variable} ${stationMono.variable}`} data-brand={brand.id}>
        <body className="bg-gray-950 text-gray-100 min-h-screen flex flex-col antialiased">
          <BrandProvider brand={brand}>
            <ToastProvider>
              <StationChrome>
                <ReferralProvider>{children}</ReferralProvider>
              </StationChrome>
              <ToastContainer />
              <ServiceWorkerRegister />
            </ToastProvider>
          </BrandProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className="dark" data-brand={brand.id}>
      <head>
        <script data-site="0f7a1259-e26d-4705-a07a-c38aba040251" src="https://crawlproof.com/stats.js" async></script>
        <script src="https://crawlproof.com/ad.js" async></script>
      </head>
      <body
        className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen flex flex-col`}
      >
        <BrandProvider brand={brand}>
          <ToastProvider>
            <Header />
            <main className="flex-1"><AdUnit /><ReferralProvider>{children}</ReferralProvider></main>
            <Footer
              bottom={
                <PfsFooter
                  site="https://smshub.dev/"
                  links={[
                    { label: "Pricing", href: "/#pricing" },
                    { label: "Rent a number", href: "/phonenumbers" },
                    { label: "Docs", href: "/docs" },
                    { label: "API", href: "/docs/api" },
                    { label: "Privacy", href: "/privacy" },
                    { label: "Terms", href: "/terms" },
                    { label: "GitHub", href: "https://github.com/profullstack/smshub" },
                  ]}
                />
              }
            />
            <ToastContainer />
            <ServiceWorkerRegister />
          </ToastProvider>
        </BrandProvider>
        <PitFooter />
      </body>
    </html>
  );
}
