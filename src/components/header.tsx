"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

const APP_ROUTES = ["/inbox", "/settings", "/campaigns", "/contacts", "/analytics", "/org"];

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#api", label: "API" },
  { href: "/#apps", label: "Apps" },
  { href: "/phonenumbers", label: "Phone Numbers" },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Hide header on app routes (inbox has its own nav)
  if (APP_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Logo priority />

        <nav className="hidden sm:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/install"
            className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors hidden sm:inline-block"
          >
            Get Started
          </Link>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 text-gray-400 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <nav className="sm:hidden border-t border-gray-800 bg-gray-950 px-4 py-4 space-y-3">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block text-sm text-gray-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <hr className="border-gray-800" />
          <Link
            href="/login"
            className="block text-sm text-gray-300 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Sign in
          </Link>
          <Link
            href="/install"
            className="block text-sm text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Get Started
          </Link>
        </nav>
      )}
    </header>
  );
}
