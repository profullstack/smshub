// Shared constants for SMSHub mobile app

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://smshub.dev";

export const colors = {
  // Backgrounds
  bg: "#030712",        // gray-950
  card: "#111827",      // gray-900
  border: "#1f2937",    // gray-800
  surface: "#1f2937",   // gray-800

  // Text
  text: "#f9fafb",      // gray-50
  textSecondary: "#9ca3af", // gray-400
  textMuted: "#6b7280",    // gray-500

  // Accents
  blue: "#2563eb",      // blue-600
  blueLight: "#60a5fa", // blue-400
  blueDark: "#1d4ed8",  // blue-700

  // Bubbles
  bubbleOutbound: "#2563eb",  // blue-600
  bubbleInbound: "#1f2937",   // gray-800
  bubbleOutboundText: "#ffffff",
  bubbleInboundText: "#f9fafb",

  // Status
  red: "#991b1b",
  redLight: "#fca5a5",
  green: "#16a34a",
  greenLight: "#86efac",

  // Unread indicator
  unreadDot: "#2563eb",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
