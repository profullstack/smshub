"use client";

import { useEffect, useState } from "react";

type Status = { connected: boolean; connected_at: string | null };

const connectionErrors: Record<string, string> = {
  groupcall_unavailable: "group.call did not answer. Try connecting again in a minute.",
  groupcall_link: "group.call could not link this SMSHub account. Try again.",
  groupcall_unlink: "group.call could not remove the connection. Try again.",
  key_create: "SMSHub could not create the private connection. Try again.",
  smshub_cleanup: "group.call disconnected, but SMSHub could not finish cleanup. Reload this page.",
  token_exchange: "CoinPay sign-in did not finish. Try again.",
  linked_elsewhere: "That CoinPay account is linked to a different SMSHub account.",
  already_connected: "This SMSHub account is linked to a different CoinPay account.",
  wrong_session: "Your SMSHub session changed during sign-in. Start again from Settings.",
};

export function GroupCallIntegrationCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/integrations/groupcall", { cache: "no-store" });
      if (response.ok) setStatus(await response.json());
    } catch {
      setError("Could not load group.call connection status.");
    }
  };

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("groupcall") === "error") {
      setError(connectionErrors[params.get("reason") || ""] || "Could not connect group.call. Try again.");
    }
  }, []);

  return (
    <section className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">group.call</h2>
          <p className="text-sm text-gray-400">
            Send group.call room texts through your SMSHub number. CoinPay links the same account on both services.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            SMSHub creates and sends the integration credential privately; it is never shown or copied to your browser.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <form action="/api/coinpay/groupcall/connect" method="POST">
            <button
              type="submit"
              className="rounded-lg px-4 py-2 bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white"
            >
              {status?.connected ? "Reconnect with CoinPay" : "Connect with CoinPay"}
            </button>
          </form>
          {status?.connected && (
            <form action="/api/coinpay/groupcall/disconnect" method="POST">
              <button type="submit" className="rounded-lg px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-200">
                Disconnect
              </button>
            </form>
          )}
        </div>
      </div>
      {status?.connected && <p className="text-sm text-green-400">Connected to group.call.</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
