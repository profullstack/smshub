import Link from "next/link";
import type { Metadata } from "next";

// A 404 names no canonical (the layout gives none) and is never indexed.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-20 text-center space-y-4">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-gray-400">There is nothing at this address.</p>
      <Link href="/" className="text-green-400 hover:underline">Back to the homepage</Link>
    </div>
  );
}
