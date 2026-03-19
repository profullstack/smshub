"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CampaignStatus } from "@/lib/campaigns/types";

interface CampaignRow {
  id: string;
  name: string;
  message_template: string;
  status: CampaignStatus;
  phone_number_id: string;
  created_at: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  phone_numbers?: { number: string; friendly_name: string | null } | null;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const res = await fetch("/api/campaigns");
    const data = await res.json();
    if (data.campaigns) setCampaigns(data.campaigns);
    setLoading(false);
  };

  const statusColor = (status: CampaignStatus) => {
    switch (status) {
      case "draft":
        return "text-gray-400";
      case "sending":
        return "text-yellow-400";
      case "sent":
        return "text-green-400";
      case "failed":
        return "text-red-400";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading campaigns...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <div className="flex gap-3">
            <Link
              href="/"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              ← Back to Inbox
            </Link>
            <Link
              href="/campaigns/new"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
            >
              + New Campaign
            </Link>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No campaigns yet</p>
            <Link
              href="/campaigns/new"
              className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
            >
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="bg-gray-900 rounded-lg p-4 border border-gray-800"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-lg">{campaign.name}</h3>
                    <p className="text-sm text-gray-400 mt-1 truncate max-w-md">
                      {campaign.message_template}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>
                        Recipients: {campaign.total_recipients}
                      </span>
                      <span className="text-green-400">
                        Sent: {campaign.sent_count}
                      </span>
                      <span className="text-red-400">
                        Failed: {campaign.failed_count}
                      </span>
                      <span>
                        Pending: {campaign.pending_count}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-medium capitalize ${statusColor(campaign.status)}`}
                  >
                    {campaign.status}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mt-2">
                  Created {new Date(campaign.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
