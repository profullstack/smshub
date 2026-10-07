"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STATION_TABS, activeStationTab, stationFrame, type StationTab } from "@/lib/station-nav";
import { StationLogo, StationMark } from "./station-logo";
import { InstallButton } from "./install-button";

function TabIcon({ icon, className = "h-6 w-6" }: { icon: StationTab["icon"]; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (icon) {
    case "receiver":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="12" rx="2.5" />
          <path d="M7 8l9-5" />
          <circle cx="8.5" cy="14" r="2.5" />
          <path d="M14 12.5h4M14 15.5h4" />
        </svg>
      );
    case "numbers":
      return (
        <svg {...common}>
          <path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" />
        </svg>
      );
    case "lines":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19a5.5 5.5 0 0111 0" />
          <path d="M16 5.5a3 3 0 010 5.5M18.5 19a5 5 0 00-2.5-4.3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </svg>
      );
  }
}

function TabBar() {
  const pathname = usePathname();
  const active = activeStationTab(pathname);
  return (
    <>
      {/* Phones: a bottom tab bar, thumb-reachable, over the home indicator. */}
      <nav
        aria-label="App"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-gray-800 bg-gray-950/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-4">
          {STATION_TABS.map((tab) => {
            const on = active?.href === tab.href;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium tracking-wide transition-colors ${
                    on ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <TabIcon icon={tab.icon} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Tablets and up: a slim rail on the left. */}
      <nav
        aria-label="App"
        className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center gap-2 border-r border-gray-800 bg-gray-950 py-5 md:flex"
      >
        <Link href="/inbox" aria-label="Number Station" className="mb-4">
          <StationMark className="h-9 w-9" />
        </Link>
        {STATION_TABS.map((tab) => {
          const on = active?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              title={tab.label}
              className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-medium transition-colors ${
                on ? "bg-blue-500/15 text-blue-400" : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
              }`}
            >
              <TabIcon icon={tab.icon} className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-800/80 bg-gray-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <StationLogo />
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link href="/#how" className="hidden text-sm text-gray-400 hover:text-gray-100 sm:inline">
            How it works
          </Link>
          <Link href="/#pricing" className="hidden text-sm text-gray-400 hover:text-gray-100 sm:inline">
            Pricing
          </Link>
          <Link href="/login" className="text-sm text-gray-300 hover:text-gray-100">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Tune in
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-gray-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-2">
          <StationLogo />
          <p className="font-mono text-xs text-gray-500">Private numbers, live on one receiver.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-400">
          <Link href="/numbers" className="hover:text-gray-100">Rent a number</Link>
          <Link href="/docs" className="hover:text-gray-100">API docs</Link>
          <Link href="/terms" className="hover:text-gray-100">Terms</Link>
          <Link href="/privacy" className="hover:text-gray-100">Privacy</Link>
          <InstallButton />
        </div>
      </div>
    </footer>
  );
}

/** The frame around every Number Station page: site, sign-in, or the app itself. */
export function StationChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const frame = stationFrame(pathname);

  if (frame === "app") {
    return (
      <>
        <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-20">{children}</main>
        <TabBar />
      </>
    );
  }

  // Sign-in pages draw the brand's logo themselves, so no header here.
  if (frame === "auth") {
    return <main className="flex-1 pt-[env(safe-area-inset-top)]">{children}</main>;
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
