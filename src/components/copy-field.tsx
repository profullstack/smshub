"use client";

import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="flex items-center gap-2 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 my-2">
      <code className="flex-1 text-sm text-green-300 break-all">{value}</code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 px-3 py-1 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
