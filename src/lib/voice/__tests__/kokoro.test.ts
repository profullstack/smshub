import { mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  alertVoice,
  audioToken,
  DEFAULT_AGENT_VOICE,
  kokoroGateway,
  readAudio,
  speakOnC0mpute,
  TTL_MS,
  wavSeconds,
  type SpeechEnv,
} from "../kokoro";

/** A minimal but real 16-bit PCM WAV header plus `frames` of silence. */
function wav(frames: number, rate = 24000): Buffer {
  const data = Buffer.alloc(frames * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), "kokoro-test-"));
}

function env(extra: Record<string, string>): SpeechEnv {
  return {
    C0MPUTE_SPEECH_URL: "http://speech.internal:8787",
    C0MPUTE_SPEECH_TOKEN: "token-abc",
    ALERT_AUDIO_SECRET: "secret",
    ...extra,
  };
}

describe("kokoroGateway", () => {
  it("is off until both the url and the token are set", () => {
    expect(kokoroGateway({})).toBeNull();
    expect(kokoroGateway({ C0MPUTE_SPEECH_URL: "http://x" })).toBeNull();
    expect(kokoroGateway({ C0MPUTE_SPEECH_TOKEN: "t" })).toBeNull();
    expect(
      kokoroGateway({ C0MPUTE_SPEECH_URL: "http://x:8787/", C0MPUTE_SPEECH_TOKEN: "t" })
    ).toEqual({ baseUrl: "http://x:8787", token: "t" });
  });
});

describe("alertVoice", () => {
  it("defaults to riotcoder's voice and ignores a voice no node serves", () => {
    expect(alertVoice({})).toBe(DEFAULT_AGENT_VOICE);
    expect(alertVoice({ ALERT_KOKORO_VOICE: "af_bella" })).toBe("af_bella");
    expect(alertVoice({ ALERT_KOKORO_VOICE: "nope" })).toBe(DEFAULT_AGENT_VOICE);
  });
});

describe("speakOnC0mpute", () => {
  it("renders the line on the network and returns a fetchable url", async () => {
    const dir = await scratch();
    let sent: { url: string; body: unknown } | null = null;
    const line = await speakOnC0mpute("alert, twice over", {
      id: "alert-1:call-1",
      publicBase: "https://smshub.dev/",
      env: env({ ALERT_AUDIO_DIR: dir }),
      fetcher: (async (url: string, init: RequestInit) => {
        sent = { url: String(url), body: JSON.parse(String(init.body)) };
        return new Response(new Uint8Array(wav(24000)), { status: 200 });
      }) as unknown as typeof fetch,
    });

    expect(sent!.url).toBe("http://speech.internal:8787/v1/tts");
    expect(sent!.body).toMatchObject({ engine: "kokoro", voice: DEFAULT_AGENT_VOICE, text: "alert, twice over" });
    const token = audioToken("alert-1:call-1", env({ ALERT_AUDIO_DIR: dir }));
    expect(line).toEqual({ url: `https://smshub.dev/api/v1/alerts/audio/${token}`, seconds: 1 });
    // The bytes are on disk under the token, ready for Telnyx to fetch.
    expect((await readFile(join(dir, `${token}.wav`))).subarray(0, 4).toString()).toBe("RIFF");
  });

  it("gives up quietly so the call can still speak the old way", async () => {
    const dir = await scratch();
    const options = { id: "a:b", publicBase: "https://smshub.dev", env: env({ ALERT_AUDIO_DIR: dir }) };

    // No gateway configured.
    expect(
      await speakOnC0mpute("x", { ...options, env: { ALERT_AUDIO_DIR: dir } })
    ).toBeNull();
    // Empty line.
    expect(await speakOnC0mpute("   ", options)).toBeNull();
    // A base url we cannot build an absolute link from.
    expect(await speakOnC0mpute("x", { ...options, publicBase: "smshub.dev" })).toBeNull();
    // The gateway refused.
    expect(
      await speakOnC0mpute("x", {
        ...options,
        fetcher: (async () => new Response("no nodes", { status: 503 })) as unknown as typeof fetch,
      })
    ).toBeNull();
    // The network threw.
    expect(
      await speakOnC0mpute("x", {
        ...options,
        fetcher: (async () => {
          throw new Error("connection reset");
        }) as unknown as typeof fetch,
      })
    ).toBeNull();
    // A 200 that is not audio: an error page would otherwise be "played".
    expect(
      await speakOnC0mpute("x", {
        ...options,
        fetcher: (async () => new Response("<!doctype html><title>oops</title>", { status: 200 })) as unknown as typeof fetch,
      })
    ).toBeNull();
  });
});

describe("readAudio", () => {
  it("serves only a well-formed token, and never walks out of its directory", async () => {
    const dir = await scratch();
    const e = env({ ALERT_AUDIO_DIR: dir });
    const token = audioToken("alert-9:call-9", e);
    await writeFile(join(dir, `${token}.wav`), wav(2400));

    expect((await readAudio(token, e))?.length).toBe(44 + 4800);
    expect(await readAudio("../../etc/passwd", e)).toBeNull();
    expect(await readAudio(`${token}/../${token}`, e)).toBeNull();
    expect(await readAudio("0".repeat(32), e)).toBeNull();
    expect(await readAudio("", e)).toBeNull();
  });

  it("a token is tied to the secret, so another deployment's url is useless", async () => {
    const dir = await scratch();
    const mine = audioToken("same-id", env({ ALERT_AUDIO_DIR: dir, ALERT_AUDIO_SECRET: "mine" }));
    const theirs = audioToken("same-id", env({ ALERT_AUDIO_DIR: dir, ALERT_AUDIO_SECRET: "theirs" }));
    expect(mine).not.toBe(theirs);
    expect(mine).toMatch(/^[0-9a-f]{32}$/);
  });

  it("sweeps a line older than its ttl on the next write", async () => {
    const dir = await scratch();
    const e = env({ ALERT_AUDIO_DIR: dir });
    const stale = audioToken("stale", e);
    const stalePath = join(dir, `${stale}.wav`);
    await writeFile(stalePath, wav(2400));
    const old = (Date.now() - TTL_MS - 60_000) / 1000;
    await utimes(stalePath, old, old);

    await speakOnC0mpute("fresh", {
      id: "fresh",
      publicBase: "https://smshub.dev",
      env: e,
      fetcher: (async () => new Response(new Uint8Array(wav(2400)), { status: 200 })) as unknown as typeof fetch,
    });
    // The sweep runs in the background; give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await readAudio(stale, e)).toBeNull();
    expect(await readAudio(audioToken("fresh", e), e)).not.toBeNull();
  });
});

describe("wavSeconds", () => {
  it("reads the length out of the header", () => {
    expect(wavSeconds(wav(24000))).toBe(1);
    expect(wavSeconds(wav(12000))).toBe(0.5);
    expect(wavSeconds(wav(16000, 16000))).toBe(1);
    expect(wavSeconds(Buffer.alloc(10))).toBe(0);
  });
});
