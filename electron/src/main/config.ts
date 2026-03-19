import { app } from "electron";
import path from "path";
import fs from "fs";

interface AppConfig {
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function loadEnvFile(): Record<string, string> {
  const envPaths = [
    path.join(app.getAppPath(), ".env"),
    path.join(process.cwd(), ".env"),
    path.join(__dirname, "..", ".env"),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const vars: Record<string, string> = {};
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        vars[key] = value;
      }
      return vars;
    }
  }
  return {};
}

function getEnv(key: string, fallback: string = ""): string {
  return process.env[key] || fallback;
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  // Load .env file values into process.env (don't override existing)
  const envVars = loadEnvFile();
  for (const [key, value] of Object.entries(envVars)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  const isProd = app.isPackaged;

  _config = {
    appUrl: getEnv(
      "APP_URL",
      isProd ? "https://smshub.dev" : "http://localhost:3000"
    ),
    supabaseUrl: getEnv("NEXT_PUBLIC_SUPABASE_URL", ""),
    supabaseAnonKey: getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""),
  };

  return _config;
}
