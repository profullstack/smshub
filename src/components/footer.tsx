"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

const APP_ROUTES = ["/inbox", "/settings", "/campaigns", "/contacts", "/analytics", "/org"];

export function Footer({ bottom }: { bottom?: React.ReactNode }) {
  const pathname = usePathname();

  // Hide footer on app routes
  if (APP_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return (
    <footer className="border-t border-gray-800 bg-gray-950 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Logo
              imageClassName="h-14 w-auto"
              className="flex items-center gap-3 mb-4"
            />
            <p className="text-sm text-gray-400">
              Multi-platform SMS messaging for developers and businesses.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Product</h3>
            <ul className="space-y-2">
              <li><Link href="/#features" className="text-sm text-gray-400 hover:text-white transition-colors">Features</Link></li>
              <li><Link href="/#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="/phonenumbers" className="text-sm text-gray-400 hover:text-white transition-colors">Phone Numbers</Link></li>
              <li><Link href="/#api" className="text-sm text-gray-400 hover:text-white transition-colors">API</Link></li>
            </ul>
          </div>

          {/* Platforms */}
          <div>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Platforms</h3>
            <ul className="space-y-2">
              <li><span className="text-sm text-gray-400">🌐 Web App</span></li>
              <li><span className="text-sm text-gray-400">📱 iOS & Android</span></li>
              <li><span className="text-sm text-gray-400">🖥 Desktop</span></li>
              <li><span className="text-sm text-gray-400">📲 PWA</span></li>
            </ul>
          </div>

          {/* Providers */}
          <div>
            <h3 className="text-sm font-semibold text-gray-200 mb-3">Providers</h3>
            <ul className="space-y-2">
              <li><Link href="/docs/twilio" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">Twilio setup</Link></li>
              <li><Link href="/docs/telnyx" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">Telnyx setup</Link></li>
              <li><Link href="/phonenumbers" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">phonenumbers.bot</Link></li>
            </ul>
          </div>
        </div>

        {/* Copyright, links and the Profullstack webring: @profullstack/footer, server-rendered in app/layout.tsx */}
        {bottom && <div className="mt-8">{bottom}</div>}
      </div>
    </footer>
  );
}
