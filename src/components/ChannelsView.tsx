"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendFriendRequest, removeFriend } from "@/lib/social";
import { useToast } from "./Toast";
import { Spinner } from "./Spinner";
import { IconArrowLeft, IconPlus } from "./icons";

interface ChannelStat {
  username: string;
  label: string;
  description: string;
  totalJobs: number;
  subscribed: boolean;
  friendshipId: string | null;
  myCount: number;
}

export default function ChannelsView({ username }: { username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [channels, setChannels] = useState<ChannelStat[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/channels", { cache: "no-store" });
      if (!res.ok) throw new Error("Couldn't load feeds.");
      const data = await res.json();
      setChannels(data.channels ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load feeds.");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function subscribe(ch: ChannelStat) {
    setBusy(ch.username);
    toast(`Subscribing to ${ch.label}…`, "info");
    try {
      await sendFriendRequest(ch.username);
      toast(`Subscribed to ${ch.label}`, "success");
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Subscribe failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function unsubscribe(ch: ChannelStat) {
    if (!ch.friendshipId) return;
    setBusy(ch.username);
    toast(`Unsubscribing from ${ch.label}…`, "info");
    try {
      await removeFriend(ch.friendshipId);
      toast(`Unsubscribed from ${ch.label}`, "success");
      await reload();
    } catch {
      toast("Unsubscribe failed", "error");
    } finally {
      setBusy(null);
    }
  }

  const subscribed = (channels ?? []).filter((c) => c.subscribed);
  const available = (channels ?? []).filter((c) => !c.subscribed);

  return (
    <div className="channels-page">
      <header className="channels-head">
        <button
          className="btn btn-icon btn-ghost"
          onClick={() => router.push("/")}
          aria-label="Back to dashboard"
          title="Back to dashboard"
        >
          <IconArrowLeft />
        </button>
        <div>
          <h1>Job feed channels</h1>
          <p>Subscribe to a feed and its postings sync into your list automatically.</p>
        </div>
      </header>

      {error && <div className="auth-error">{error}</div>}
      {!channels && !error && <Spinner label="Loading feeds…" full />}

      {channels && (
        <div className="channels-layout">
          {/* Left: subscribed feeds — compact blocks */}
          <aside className="channels-left">
            <h2>Your feeds ({subscribed.length})</h2>
            {subscribed.length === 0 ? (
              <div className="empty-mini">No feeds yet — subscribe from the right.</div>
            ) : (
              <div className="mini-list">
                {subscribed.map((ch) => (
                  <div className="channel-mini" key={ch.username}>
                    <div className="mini-main">
                      <div className="mini-name">{ch.label}</div>
                      <div className="mini-sub">
                        <strong>{ch.myCount}</strong> brought in · {ch.totalJobs} in feed
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-danger mini-unsub"
                      onClick={() => unsubscribe(ch)}
                      disabled={busy === ch.username}
                    >
                      Unsubscribe
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* Right: available feeds — big subscribe cards */}
          <main className="channels-right">
            <h2>Available feeds ({available.length})</h2>
            {available.length === 0 ? (
              <div className="empty-mini">You&apos;re subscribed to every feed. 🎉</div>
            ) : (
              <div className="channel-grid">
                {available.map((ch) => (
                  <div className="channel-card" key={ch.username}>
                    <div className="channel-top">
                      <h3>{ch.label}</h3>
                    </div>
                    <p className="desc">{ch.description}</p>
                    <div className="channel-stat">
                      <span className="num">{ch.totalJobs}</span> postings ready
                      <span className="stat-sub"> · sync on subscribe</span>
                    </div>
                    <div className="channel-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => subscribe(ch)}
                        disabled={busy === ch.username}
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        <IconPlus width={15} height={15} /> Subscribe
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      <div className="hint" style={{ marginTop: 26 }}>
        Signed in as <strong style={{ color: "var(--ink-2)", marginLeft: 4 }}>{username}</strong>
      </div>
    </div>
  );
}
