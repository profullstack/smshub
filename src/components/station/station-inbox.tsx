"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInbox, type Conversation, type Message } from "@/hooks/use-inbox";
import { useToast } from "@/contexts/toast-context";
import { failureReason } from "@/lib/message-status";
import { extractOtp } from "@/lib/otp";
import type { LineNumber } from "@/lib/inbox-lines";
import { NewMessageModal } from "@/components/new-message-modal";
import { ContactNameEditor } from "@/components/contact-name-editor";
import { StationMark } from "./station-logo";
import { InstallButton } from "./install-button";
import { dayLabel, initials, relativeTime, splitCode } from "./format";

function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] ${
        live ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-gray-700 bg-gray-900 text-gray-500"
      }`}
      title={live ? "Connected: new texts appear the moment they land" : "Reconnecting"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "station-pulse bg-emerald-400" : "bg-gray-600"}`} />
      {live ? "On air" : "Off air"}
    </span>
  );
}

function Avatar({ convo }: { convo: Conversation }) {
  const label = initials(convo.contacts?.name, convo.contacts?.phone);
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-700 bg-gray-900 font-mono text-sm font-semibold text-blue-300">
      {label}
    </span>
  );
}

function CodeCard({ code }: { code: string }) {
  const { addToast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      addToast("Code copied", "success");
    } catch {
      addToast("Copy failed, select the code instead", "error");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="station-rise mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-left transition-colors hover:bg-blue-500/20"
      aria-label={`Copy code ${code}`}
    >
      <span className="font-mono text-2xl font-semibold tracking-[0.18em] text-blue-200 select-all">{splitCode(code)}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-300">Copy</span>
    </button>
  );
}

function StatusMark({ status, retryCount }: { status: string; retryCount?: number }) {
  if (status === "failed" && retryCount && retryCount > 0) return <span title={`Retried ${retryCount}x`}>⟳ failed</span>;
  switch (status) {
    case "delivered":
      return <span title="Delivered">✓✓</span>;
    case "sent":
      return <span title="Sent">✓</span>;
    case "queued":
      return <span title="Queued">◷</span>;
    case "failed":
      return <span title="Failed">✗ failed</span>;
    default:
      return null;
  }
}

function Bubble({ msg }: { msg: Message }) {
  const out = msg.direction === "outbound";
  const code = !out && msg.kind !== "call" ? extractOtp(msg.body) : null;
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-md ${
          out ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-gray-800 bg-gray-900 text-gray-100"
        }`}
      >
        {msg.media_url && (
          <img
            src={msg.media_url}
            alt="Picture message"
            className="mb-2 max-w-full cursor-pointer rounded-lg"
            onClick={() => window.open(msg.media_url!, "_blank")}
          />
        )}
        {msg.routed_from && <p className="mb-1 font-mono text-[11px] text-gray-400">From {msg.routed_from}</p>}
        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">
          {msg.kind === "call" && (
            <span aria-label="Call" className="mr-1">
              ☎
            </span>
          )}
          {msg.body}
        </p>
        {code && <CodeCard code={code} />}
        {msg.kind === "call" && msg.recording_seconds != null && (
          <div className="mt-2 space-y-1">
            <audio controls preload="none" src={`/api/messages/${msg.id}/recording`} className="w-64 max-w-full" />
            <a href={`/api/messages/${msg.id}/recording?download=1`} className="block text-xs text-blue-300 hover:text-blue-200">
              Download mp3
            </a>
          </div>
        )}
        <p className={`mt-1 flex items-center gap-1.5 font-mono text-[10px] ${out ? "justify-end text-blue-100/80" : "text-gray-500"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {out && <StatusMark status={msg.status} retryCount={msg.retry_count} />}
        </p>
        {out && msg.status === "failed" && (
          <p className="mt-1 text-xs text-red-100" role="status">
            Not delivered{failureReason(msg) ? `: ${failureReason(msg)}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export function StationInbox({
  conversations: initialConversations,
  numbers = [],
}: {
  conversations: Conversation[];
  numbers?: LineNumber[];
}) {
  const inbox = useInbox(initialConversations, numbers);
  const {
    filteredConversations,
    selectedConvo,
    setSelectedConvo,
    messages,
    newMessage,
    setNewMessage,
    sending,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    suggestingReply,
    lines,
    totalUnread,
    activeLine,
    chooseLine,
    live,
    getUnreadCount,
  } = inbox;
  const [composeOpen, setComposeOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // On a phone a thread is its own screen, so the system back gesture closes it.
  useEffect(() => {
    const onPop = () => setSelectedConvo(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setSelectedConvo]);

  const open = (convo: Conversation) => {
    if (!selectedConvo && window.matchMedia("(max-width: 767px)").matches) {
      window.history.pushState({ stationThread: convo.id }, "");
    }
    setSelectedConvo(convo);
  };
  const close = () => {
    if (window.history.state?.stationThread) window.history.back();
    else setSelectedConvo(null);
  };

  const noNumbers = numbers.length === 0;

  return (
    <div className="md:flex md:h-screen">
      <NewMessageModal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={inbox.reloadConversations}
        defaultNumberId={activeLine?.id}
      />

      {/* The list */}
      <section
        className={`${selectedConvo ? "hidden md:flex" : "flex"} min-h-full flex-col md:w-[23rem] md:shrink-0 md:overflow-y-auto md:border-r md:border-gray-800`}
      >
        <header className="sticky top-0 z-30 space-y-3 border-b border-gray-800 bg-gray-950/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <StationMark className="h-7 w-7 md:hidden" />
              <h1 className="font-mono text-sm font-semibold uppercase tracking-[0.3em] text-gray-100">Receiver</h1>
              {totalUnread > 0 && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">{totalUnread}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <LiveBadge live={live} />
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-500"
                aria-label="New message"
                title="New message"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 focus-within:border-blue-500/60">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search names and numbers"
              className="w-full bg-transparent text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none"
            />
          </label>

          {/* Lines as a swipeable band of frequencies */}
          {lines.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Filter by line">
              {[{ id: null, label: "All", number: "", unread: totalUnread }, ...lines].map((line) => {
                const on = (activeLine?.id ?? null) === line.id;
                return (
                  <button
                    key={line.id ?? "all"}
                    type="button"
                    onClick={() => chooseLine(line.id)}
                    aria-pressed={on}
                    title={line.number || "Every number"}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      on ? "border-blue-500 bg-blue-500/15 text-blue-200" : "border-gray-800 bg-gray-900 text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span className="max-w-[9rem] truncate">{line.label}</span>
                    {line.number && <span className="font-mono text-[10px] text-gray-500">··{line.number.slice(-4)}</span>}
                    {line.unread > 0 && (
                      <span className="rounded-full bg-blue-600 px-1.5 font-mono text-[10px] leading-4 text-white">{line.unread}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 rounded-xl border border-gray-800 bg-gray-900 p-0.5 text-xs font-medium" role="tablist">
            {[false, true].map((archived) => (
              <button
                key={String(archived)}
                type="button"
                role="tab"
                aria-selected={showArchived === archived}
                onClick={() => setShowArchived(archived)}
                className={`rounded-[10px] py-1.5 transition-colors ${
                  showArchived === archived ? "bg-gray-800 text-gray-100" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {archived ? "Archived" : "Live"}
              </button>
            ))}
          </div>
        </header>

        {noNumbers ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-16 text-center">
            <StationMark className="h-16 w-16" />
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-100">No frequency yet</h2>
              <p className="text-sm text-gray-400">
                Rent a private number and every text, code and call to it lands here live.
              </p>
            </div>
            <Link href="/numbers" className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500">
              Rent a number
            </Link>
            <InstallButton />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
            <div className="relative h-1 w-40 overflow-hidden rounded-full bg-gray-800">
              <span className="station-sweep absolute inset-y-0 w-1/3 rounded-full bg-blue-500/70" />
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-gray-500">
              {searchQuery ? "No match" : showArchived ? "Nothing archived" : "Listening"}
            </p>
            {!searchQuery && !showArchived && (
              <p className="max-w-xs text-sm text-gray-400">
                Texts to {activeLine ? activeLine.label : "your numbers"} appear here the moment they land.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-800/70">
            {filteredConversations.map((convo) => {
              const unread = getUnreadCount(convo);
              const on = selectedConvo?.id === convo.id;
              return (
                <li key={convo.id}>
                  <button
                    type="button"
                    onClick={() => open(convo)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      on ? "bg-gray-900" : "hover:bg-gray-900/60 active:bg-gray-900"
                    }`}
                  >
                    <Avatar convo={convo} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[15px] ${unread > 0 ? "font-semibold text-gray-50" : "text-gray-200"}`}>
                          {convo.contacts?.name || convo.contacts?.phone || "Unknown"}
                        </span>
                        <span className={`shrink-0 font-mono text-[11px] ${unread > 0 ? "text-blue-300" : "text-gray-500"}`}>
                          {relativeTime(convo.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-gray-500">
                          {convo.contacts?.name ? `${convo.contacts.phone} · ` : ""}
                          {convo.phone_numbers?.friendly_name || convo.phone_numbers?.number}
                        </span>
                        {unread > 0 && (
                          <span className="min-w-5 rounded-full bg-blue-600 px-1.5 text-center font-mono text-[11px] font-bold leading-5 text-white">
                            {unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The thread: its own screen on a phone, the right pane on a wide screen */}
      <section
        className={
          selectedConvo
            ? "fixed inset-0 z-50 flex flex-col bg-gray-950 md:static md:z-auto md:flex-1"
            : "hidden md:flex md:flex-1 md:items-center md:justify-center"
        }
      >
        {selectedConvo ? (
          <>
            <header className="flex items-center gap-2 border-b border-gray-800 bg-gray-950/95 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:px-4 md:py-3">
              <button
                type="button"
                onClick={close}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-300 hover:bg-gray-900 md:hidden"
                aria-label="Back"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <ContactNameEditor
                  contactId={selectedConvo.contacts?.id || ""}
                  currentName={selectedConvo.contacts?.name || null}
                  phone={selectedConvo.contacts?.phone || "Unknown"}
                  onUpdated={inbox.handleContactUpdated}
                />
                <p className="truncate font-mono text-[11px] text-gray-500">
                  on {selectedConvo.phone_numbers?.friendly_name || selectedConvo.phone_numbers?.number}
                </p>
              </div>
              <button
                type="button"
                onClick={inbox.handleArchive}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-gray-900 hover:text-gray-100"
                aria-label={selectedConvo.archived ? "Unarchive" : "Archive"}
                title={selectedConvo.archived ? "Unarchive" : "Archive"}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="5" rx="1.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9M10 13h4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={inbox.handleDelete}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-red-950 hover:text-red-300"
                aria-label="Delete conversation"
                title="Delete conversation"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                </svg>
              </button>
            </header>

            <div className="station-scanlines flex-1 space-y-2 overflow-y-auto px-3 py-4 md:px-6">
              {messages.map((msg, i) => {
                const day = dayLabel(msg.created_at);
                const showDay = i === 0 || dayLabel(messages[i - 1].created_at) !== day;
                return (
                  <div key={msg.id} className="space-y-2">
                    {showDay && (
                      <p className="py-2 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-gray-600">{day}</p>
                    )}
                    <Bubble msg={msg} />
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={inbox.handleSend}
              className="pb-safe border-t border-gray-800 bg-gray-950 px-3 pt-2 md:px-6 md:pb-3"
            >
              <div className="mb-2 flex items-end gap-2">
                <button
                  type="button"
                  onClick={inbox.handleSuggestReply}
                  disabled={suggestingReply || messages.length === 0}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-800 bg-gray-900 text-blue-300 transition-colors hover:bg-gray-800 disabled:opacity-40"
                  aria-label="Suggest a reply"
                  title="Suggest a reply"
                >
                  {suggestingReply ? (
                    <span className="station-pulse font-mono text-xs">···</span>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
                    </svg>
                  )}
                </button>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={1}
                  placeholder="Message"
                  className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-gray-800 bg-gray-900 px-4 py-2.5 text-[15px] text-gray-100 placeholder:text-gray-500 [field-sizing:content] focus:border-blue-500/60 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
                  aria-label="Send"
                >
                  {sending ? (
                    <span className="station-pulse font-mono text-xs">···</span>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                      <path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.2 1l1.9 6.4 8.4 1-8.4 1-1.9 6.4c-.2.7.5 1.3 1.2 1z" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <StationMark className="h-14 w-14 opacity-60" />
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-gray-500">Pick a conversation</p>
          </div>
        )}
      </section>
    </div>
  );
}
