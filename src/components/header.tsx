"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

const APP_ROUTES = ["/inbox", "/settings", "/campaigns", "/contacts", "/analytics", "/org"];

export function Header() {
  const pathname = usePathname();

  // Hide header on app routes (inbox has its own nav)
  if (APP_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Logo priority />

        <nav className="hidden sm:flex items-center gap-6">
          <Link href="/#features" className="text-sm text-gray-400 hover:text-white transition-colors">
            Features
          </Link>
          <Link href="/#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">
            Pricing
          </Link>
          <Link href="/#api" className="text-sm text-gray-400 hover:text-white transition-colors">
            API
          </Link>
          <Link href="/#apps" className="text-sm text-gray-400 hover:text-white transition-colors">
            Apps
          </Link>
          <Link href="/phonenumbers" className="text-sm text-gray-400 hover:text-white transition-colors">
            Phone Numbers
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-gray-300 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
