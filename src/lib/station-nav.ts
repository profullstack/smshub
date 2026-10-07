/**
 * Which frame a Number Station page sits in, and which tab is lit. Pure so it
 * can be tested without a router.
 */

export type StationFrame = "app" | "auth" | "site";

export interface StationTab {
  href: string;
  label: string;
  icon: "receiver" | "numbers" | "lines" | "settings";
}

export const STATION_TABS: StationTab[] = [
  { href: "/inbox", label: "Receiver", icon: "receiver" },
  { href: "/numbers", label: "Numbers", icon: "numbers" },
  { href: "/settings/lines", label: "Lines", icon: "lines" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const APP_PREFIXES = ["/inbox", "/numbers", "/settings", "/contacts", "/campaigns", "/analytics", "/org"];
const AUTH_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password"];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function stationFrame(pathname: string): StationFrame {
  if (APP_PREFIXES.some((p) => under(pathname, p))) return "app";
  if (AUTH_PREFIXES.some((p) => under(pathname, p))) return "auth";
  return "site";
}

/** The tab whose href is the longest prefix of the path, so /settings/lines lights Lines. */
export function activeStationTab(pathname: string): StationTab | null {
  let best: StationTab | null = null;
  for (const tab of STATION_TABS) {
    if (under(pathname, tab.href) && (!best || tab.href.length > best.href.length)) best = tab;
  }
  return best;
}
