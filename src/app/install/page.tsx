import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Install SMSHub Desktop — smshub.dev",
  description: "Download and install SMSHub desktop app for Linux, macOS, and Windows.",
};

export default function InstallPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-10">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Install SMSHub Desktop</h1>
        <p className="text-gray-400 text-lg">
          Available for Linux, macOS, and Windows
        </p>
      </div>

      {/* Recommended: curl installer */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-sm font-semibold bg-green-500/10 px-2 py-0.5 rounded">Recommended</span>
          <h2 className="text-xl font-semibold">One-line installer (Linux &amp; macOS)</h2>
        </div>
        <div className="bg-gray-950 rounded-lg p-4 overflow-x-auto">
          <code className="text-sm text-green-400">curl -fsSL https://smshub.dev/install.sh | bash</code>
        </div>
        <p className="text-sm text-gray-400">
          Downloads the latest version, creates an <code className="text-gray-300">smshub</code> command, and adds it to your PATH.
          Handles sandbox permissions automatically.
        </p>
        <div className="text-sm text-gray-500 space-y-1">
          <p>After installing: <code className="text-gray-300">smshub</code> to launch, <code className="text-gray-300">smshub update</code> to update, <code className="text-gray-300">smshub uninstall</code> to remove.</p>
        </div>
      </section>

      {/* Manual downloads */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Manual Download</h2>
        <p className="text-gray-400 text-sm">
          Download from{" "}
          <a href="https://github.com/profullstack/smshub/releases/latest" className="text-blue-400 hover:text-blue-300">
            GitHub Releases
          </a>
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Linux */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <div className="text-center">
              <span className="text-3xl">🐧</span>
              <h3 className="font-semibold mt-2">Linux</h3>
              <p className="text-sm text-gray-400">.AppImage</p>
            </div>
            <div className="text-xs text-gray-500 space-y-2">
              <p className="font-medium text-gray-300">If double-clicking doesn&apos;t work:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Right-click → Properties → Permissions → Allow executing</li>
                <li>Run from terminal: <code className="text-gray-300">./SMSHub-*.AppImage --no-sandbox</code></li>
              </ol>
              <p className="mt-2">Or use the <span className="text-green-400">curl installer</span> above (recommended).</p>
            </div>
          </div>

          {/* macOS */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <div className="text-center">
              <span className="text-3xl">🍎</span>
              <h3 className="font-semibold mt-2">macOS</h3>
              <p className="text-sm text-gray-400">.dmg</p>
            </div>
            <div className="text-xs text-gray-500 space-y-2">
              <p className="font-medium text-yellow-400">⚠ &quot;App is damaged&quot; warning</p>
              <p>The app is not signed with an Apple Developer certificate. To fix:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open <strong>Terminal</strong></li>
                <li>Run: <code className="text-gray-300 break-all">xattr -cr /Applications/SMSHub.app</code></li>
                <li>Open SMSHub from Applications</li>
              </ol>
              <p className="mt-1">Or: System Settings → Privacy &amp; Security → &quot;Open Anyway&quot;</p>
              <p className="mt-2">The <span className="text-green-400">curl installer</span> handles this automatically.</p>
            </div>
          </div>

          {/* Windows */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <div className="text-center">
              <span className="text-3xl">🪟</span>
              <h3 className="font-semibold mt-2">Windows</h3>
              <p className="text-sm text-gray-400">.exe installer</p>
            </div>
            <div className="text-xs text-gray-500 space-y-2">
              <p className="font-medium text-yellow-400">⚠ &quot;Windows protected your PC&quot;</p>
              <p>The installer is not signed with a certificate. To install:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Click <strong>&quot;More info&quot;</strong></li>
                <li>Click <strong>&quot;Run anyway&quot;</strong></li>
              </ol>
              <p className="mt-1">If browser blocks the download: click ≡ → Downloads → &quot;Keep&quot; or &quot;Keep anyway&quot;</p>
            </div>
          </div>
        </div>
      </section>

      <div className="text-center pt-4 border-t border-gray-800">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← Back to SMSHub
        </Link>
      </div>
    </div>
  );
}
