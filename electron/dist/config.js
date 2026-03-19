"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function loadEnvFile() {
    const envPaths = [
        path_1.default.join(electron_1.app.getAppPath(), ".env"),
        path_1.default.join(process.cwd(), ".env"),
        path_1.default.join(__dirname, "..", ".env"),
    ];
    for (const envPath of envPaths) {
        if (fs_1.default.existsSync(envPath)) {
            const content = fs_1.default.readFileSync(envPath, "utf-8");
            const vars = {};
            for (const line of content.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#"))
                    continue;
                const eqIdx = trimmed.indexOf("=");
                if (eqIdx === -1)
                    continue;
                const key = trimmed.slice(0, eqIdx).trim();
                let value = trimmed.slice(eqIdx + 1).trim();
                // Strip surrounding quotes
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                vars[key] = value;
            }
            return vars;
        }
    }
    return {};
}
function getEnv(key, fallback = "") {
    return process.env[key] || fallback;
}
let _config = null;
function getConfig() {
    if (_config)
        return _config;
    // Load .env file values into process.env (don't override existing)
    const envVars = loadEnvFile();
    for (const [key, value] of Object.entries(envVars)) {
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
    const isProd = electron_1.app.isPackaged;
    _config = {
        appUrl: getEnv("APP_URL", isProd ? `file://${path_1.default.join(electron_1.app.getAppPath(), "renderer", "index.html")}` : "http://localhost:3000"),
        supabaseUrl: getEnv("NEXT_PUBLIC_SUPABASE_URL", ""),
        supabaseAnonKey: getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""),
    };
    return _config;
}
