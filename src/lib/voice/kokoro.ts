/**
 * Calls spoken in one of our agents' own voices, synthesized on the c0mpute
 * network instead of a hosted TTS vendor.
 *
 * A Telnyx `speak` command renders text on Telnyx's side. This renders it on
 * ours: POST /v1/tts on the c0mpute speech gateway auctions a `tts.synthesize`
 * job to a node running Kokoro (an int8 ONNX export of hexgrad/Kokoro-82M,
 * which every c0mpute node provisions itself), and hands back a WAV. The call
 * then plays that file, so the voice is the agent's, the model is ours, and
 * there is no per-character bill.
 *
 * The WAV lands in a short-lived cache on disk with an HMAC-named path, and
 * `/api/v1/alerts/audio/<token>` serves it unauthenticated, because the only
 * fetcher is Telnyx's media loader. The token is derived from the bytes and a
 * server secret, so a path cannot be guessed or walked, and anything older
 * than TTL_MS is swept on the next write.
 *
 * Every step is optional: no gateway configured, a node that cannot be
 * reached, a synth that fails — all return null, and the caller falls back to
 * a plain Telnyx `speak`. An alert must still go out when the network is
 * having a bad day.
 */

import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Keep a rendered line only as long as a call needs to fetch it. */
export const TTL_MS = 10 * 60 * 1000;

/** The longest line we ask a node to read; the gateway caps this too. */
const MAX_CHARS = 6000;

/** riotcoder's voice in its OpenProfile, and the default for alert calls. */
export const DEFAULT_AGENT_VOICE = "am_michael";

/** Voices the gateway's Kokoro engine serves. */
export const KOKORO_VOICES = ["af_sarah", "af_bella", "am_onyx", "am_michael"] as const;

/** Just the environment variables this module reads. */
export type SpeechEnv = Record<string, string | undefined>;

export interface KokoroGateway {
  baseUrl: string;
  token: string;
}

/** The c0mpute speech gateway, when this deployment has one. */
export function kokoroGateway(env: SpeechEnv = process.env): KokoroGateway | null {
  const baseUrl = env.C0MPUTE_SPEECH_URL?.trim().replace(/\/+$/, "");
  const token = env.C0MPUTE_SPEECH_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

/** The voice alert calls speak in: an env override, else riotcoder's. */
export function alertVoice(env: SpeechEnv = process.env): string {
  const chosen = env.ALERT_KOKORO_VOICE?.trim();
  return chosen && (KOKORO_VOICES as readonly string[]).includes(chosen) ? chosen : DEFAULT_AGENT_VOICE;
}

/**
 * The same model, rendered by Telnyx instead of by us.
 *
 * Telnyx hosts Kokoro as `Telnyx.KokoroTTS.<voice>`, so when our own gateway
 * is out of reach the call still speaks in the agent's voice rather than a
 * generic one — it just costs a vendor round trip instead of a node's CPU.
 * This is the middle of three tiers: our network, Telnyx's copy, then
 * whatever the account's default voice is.
 */
export function telnyxKokoroVoice(env: SpeechEnv = process.env): { voice: string; language: string } {
  return { voice: `Telnyx.KokoroTTS.${alertVoice(env)}`, language: "en-US" };
}

/** Where rendered lines wait to be fetched. Never /tmp: that is quota-bound. */
export function audioDir(env: SpeechEnv = process.env): string {
  return env.ALERT_AUDIO_DIR?.trim() || join(process.cwd(), ".cache", "alert-audio");
}

/**
 * The secret the path token is signed with. A deployment without one gets a
 * per-process random secret: tokens then stop working after a restart, which
 * only matters for a call in flight during a deploy.
 */
function audioSecret(env: SpeechEnv = process.env): string {
  return env.ALERT_AUDIO_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || processSecret;
}
const processSecret = randomBytes(32).toString("hex");

/** A path token nobody can guess or walk: 32 hex chars, no separators. */
export function audioToken(id: string, env: SpeechEnv = process.env): string {
  return createHmac("sha256", audioSecret(env)).update(id).digest("hex").slice(0, 32);
}

/** Drop rendered lines past their TTL, so the cache cannot grow without bound. */
async function sweep(dir: string, now = Date.now()): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((name) => name.endsWith(".wav"))
      .map(async (name) => {
        const path = join(dir, name);
        try {
          const info = await stat(path);
          if (now - info.mtimeMs > TTL_MS) await unlink(path);
        } catch {
          // Someone else swept it, or it is being written. Either is fine.
        }
      })
  );
}

/** Read a cached line back out, by the token in its URL. */
export async function readAudio(
  token: string,
  env: SpeechEnv = process.env
): Promise<Buffer | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  try {
    const bytes = await readFile(join(audioDir(env), `${token}.wav`));
    return bytes.length > 44 ? bytes : null;
  } catch {
    return null;
  }
}

export interface SpokenLine {
  /** The absolute URL to hand Telnyx. */
  url: string;
  seconds: number;
}

/**
 * Render `text` in `voice` on the c0mpute network and cache it for Telnyx.
 *
 * `id` names the cache entry (the alert id and call id make a good one) and
 * `publicBase` is the origin Telnyx will fetch from. Returns null whenever
 * this deployment cannot do it, which is never an error: the caller speaks
 * the line the old way instead.
 */
export async function speakOnC0mpute(
  text: string,
  options: {
    id: string;
    publicBase: string;
    voice?: string;
    env?: SpeechEnv;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<SpokenLine | null> {
  const env = options.env ?? process.env;
  const gateway = kokoroGateway(env);
  const line = text.trim();
  if (!gateway || !line || line.length > MAX_CHARS) return null;
  const base = options.publicBase.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) return null;

  const doFetch = options.fetcher ?? fetch;
  let wav: Buffer;
  try {
    const response = await doFetch(`${gateway.baseUrl}/v1/tts`, {
      method: "POST",
      headers: { authorization: `Bearer ${gateway.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        text: line,
        engine: "kokoro",
        voice: options.voice ?? alertVoice(env),
        locale: "en-us",
        speed: 1,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    });
    if (!response.ok) return null;
    wav = Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
  // A WAV, not an error page: RIFF....WAVE, and long enough to be speech.
  if (wav.length < 1024 || wav.subarray(0, 4).toString() !== "RIFF" || wav.subarray(8, 12).toString() !== "WAVE") {
    return null;
  }

  const dir = audioDir(env);
  const token = audioToken(options.id, env);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${token}.wav`), wav);
  } catch {
    return null;
  }
  void sweep(dir);

  return { url: `${base}/api/v1/alerts/audio/${token}`, seconds: wavSeconds(wav) };
}

/** How long a 16-bit PCM WAV runs, for the log line. */
export function wavSeconds(wav: Buffer): number {
  if (wav.length < 44) return 0;
  const rate = wav.readUInt32LE(24);
  const channels = wav.readUInt16LE(22) || 1;
  const bits = wav.readUInt16LE(34) || 16;
  const bytesPerFrame = (bits / 8) * channels;
  if (!rate || !bytesPerFrame) return 0;
  return Math.round(((wav.length - 44) / bytesPerFrame / rate) * 100) / 100;
}
