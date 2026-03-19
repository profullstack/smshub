"use client";

import { useToast } from "@/contexts/toast-context";

const typeStyles = {
  success: "bg-green-600 border-green-500",
  error: "bg-red-600 border-red-500",
  info: "bg-blue-600 border-blue-500",
};

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`${typeStyles[toast.type]} border rounded-lg px-4 py-3 text-white text-sm shadow-lg flex items-center gap-2 animate-slide-in min-w-[280px] max-w-[400px]`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-white/70 hover:text-white ml-2 text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
