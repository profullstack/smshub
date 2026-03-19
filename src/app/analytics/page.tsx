"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AnalyticsStats {
  total_sent: number;
  total_received: number;
  active_conversations: number;
  messages_by_day: { date: string; sent: number; received: number }[];
  avg_response_time_seconds: number | null;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const res = await fetch("/api/analytics");
    const data = await res.json();
    if (data.stats) setStats(data.stats);
    setLoading(false);
  };

  const formatResponseTime = (seconds: number | null) => {
    if (seconds === null) return "N/A";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading analytics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Failed to load analytics</p>
      </div>
    );
  }

  const maxMessages = Math.max(
    ...stats.messages_by_day.map((d) => d.sent + d.received),
    1
  );

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <Link
            href="/"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ← Back to Inbox
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-blue-400">
              {stats.total_sent}
            </div>
            <div className="text-xs text-gray-500 mt-1">Messages Sent</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-green-400">
              {stats.total_received}
            </div>
            <div className="text-xs text-gray-500 mt-1">Messages Received</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-purple-400">
              {stats.active_conversations}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Active Conversations (7d)
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-yellow-400">
              {formatResponseTime(stats.avg_response_time_seconds)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Avg Response Time
            </div>
          </div>
        </div>

        {/* Messages by Day Table/Chart */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">Messages (Last 30 Days)</h2>
          {stats.messages_by_day.length === 0 ? (
            <p className="text-gray-500 text-sm">No data yet</p>
          ) : (
            <div className="space-y-2">
              {stats.messages_by_day.map((day) => (
                <div key={day.date} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-gray-400 text-xs">
                    {day.date}
                  </span>
                  <div className="flex-1 flex gap-1">
                    <div
                      className="bg-blue-600 h-5 rounded-sm"
                      style={{
                        width: `${(day.sent / maxMessages) * 100}%`,
                        minWidth: day.sent > 0 ? "4px" : "0",
                      }}
                      title={`Sent: ${day.sent}`}
                    />
                    <div
                      className="bg-green-600 h-5 rounded-sm"
                      style={{
                        width: `${(day.received / maxMessages) * 100}%`,
                        minWidth: day.received > 0 ? "4px" : "0",
                      }}
                      title={`Received: ${day.received}`}
                    />
                  </div>
                  <span className="w-16 text-right text-xs text-gray-500">
                    {day.sent + day.received}
                  </span>
                </div>
              ))}
              <div className="flex gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-blue-600 rounded-sm inline-block" />
                  Sent
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-600 rounded-sm inline-block" />
                  Received
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
