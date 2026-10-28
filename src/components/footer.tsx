"use client";

import { usePathname } from "next/navigation";

const APP_ROUTES = ["/inbox", "/settings", "/campaigns", "/contacts", "/groups", "/analytics", "/org"];

/**
 * One footer row: links, copyright and the Profullstack ring, from
 * @profullstack/footer (an async server component rendered in app/layout.tsx
 * and handed down as `bottom`). Hidden on app routes.
 */
export function Footer({ bottom }: { bottom?: React.ReactNode }) {
  const pathname = usePathname();

  if (APP_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return <footer className="border-t border-gray-800 bg-gray-950 mt-auto text-gray-400">{bottom}</footer>;
}
