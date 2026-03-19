"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const APP_ROUTES = ["/inbox", "/settings", "/campaigns", "/contacts", "/analytics", "/org"];

export function Footer() {
  const pathname = usePathname();

  // Hide footer on app routes
  if (APP_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return (
    <footer className="border-t border-gray-800 bg-gray-950 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <span className="text-2xl">📱</span>
              <span className="text-lg font-bold">SMSHub</span>
            </Link>
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
              <li><span className="text-sm text-gray-400">Twilio</span></li>
              <li><span className="text-sm text-gray-400">Telnyx</span></li>
              <li><Link href="/phonenumbers" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">phonenumbers.bot</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()}{" "}
            <a href="https://profullstack.com" className="hover:text-gray-300 transition-colors">
              Profullstack, Inc.
            </a>{" "}
            All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link href="/privacy" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Terms
            </Link>
            <Link href="https://github.com/profullstack/smshub" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              GitHub
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
