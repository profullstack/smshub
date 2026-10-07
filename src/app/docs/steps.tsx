import type { ReactNode } from "react";

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-6 list-none">{children}</ol>;
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-semibold">
        {n}
      </span>
      <div className="flex-1 space-y-2 text-gray-300">
        <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
        {children}
      </div>
    </li>
  );
}

export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-yellow-700 bg-yellow-950/40 p-4 space-y-2 text-gray-300">
      <h2 className="font-semibold text-yellow-300">{title}</h2>
      {children}
    </div>
  );
}
