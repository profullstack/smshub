"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const APP_ROUTES = ["/inbox", "/settings", "/campaigns", "/contacts", "/analytics", "/org"];

const LINKS = [
  { label: "Pricing", href: "/#pricing" },
  { label: "Rent a number", href: "/phonenumbers" },
  { label: "Docs", href: "/docs" },
  { label: "API", href: "/docs/api" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "GitHub", href: "https://github.com/profullstack/smshub" },
];

export function Footer() {
  const pathname = usePathname();

  // Hide footer on app routes
  if (APP_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return (
    <footer className="border-t border-gray-800 bg-gray-950 mt-auto">
      <nav
        aria-label="Footer"
        className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gray-400"
      >
        <span>
          &copy; {new Date().getFullYear()}{" "}
          <a href="https://profullstack.com/" className="hover:text-white transition-colors">Profullstack, Inc.</a>
        </span>
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-white transition-colors">
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
