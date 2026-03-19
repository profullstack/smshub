"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">You&apos;re Offline</h1>
        <p className="text-gray-400">
          SMSHub requires an internet connection to send and receive messages.
        </p>
        <p className="text-gray-500 text-sm">
          Check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
