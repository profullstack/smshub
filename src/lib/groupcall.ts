export const GROUPCALL_API_KEY_NAME = "group.call integration";

export const GROUPCALL_BASE_URL =
  ((process.env as Record<string, string | undefined>).GROUPCALL_URL || "https://group.call.pit.world").replace(/\/+$/, "");
