"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sendFriendRequest, removeFriend } from "@/lib/social";
import { useToast } from "./Toast";
import { Spinner } from "./Spinner";
import { IconArrowLeft, IconPlus, IconSearch, IconUsers } from "./icons";

interface ChannelStat {
  username: string;
  label: string;
  description: string;
  totalJobs: number;
  subscribed: boolean;
  friendshipId: string | null;
  myCount: number;
  subscribers: number;
}

export default function ChannelsView({ username }: { username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [channels, setChannels] = useState<ChannelStat[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (channels ?? [])
      .filter((c) => !c.subscribed)
      .filter(
        (c) =>
          !q ||
          c.label.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      )
      // Most-subscribed feeds first; ties broken alphabetically.
      .sort((a, b) => b.subscribers - a.subscribers || a.label.localeCompare(b.label));
  }, [channels, search]);
  const availableTotal = (channels ?? []).filter((c) => !c.subscribed).length;

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

      <details className="how-box" open>
        <summary>What this is &amp; how to use it</summary>
        <p className="how-lead">
          Channels are curated job feeds (by role, company, or source). Subscribe to the ones that fit what you&apos;re looking for, and
          fresh postings from those feeds flow into your application tracker automatically — no manual searching every day.
        </p>
        <ol>
          <li><strong>Browse or search.</strong> Use the search box to find feeds by role, company, or keyword.</li>
          <li><strong>Subscribe.</strong> Click <em>Subscribe</em> on the feeds you want to follow.</li>
          <li><strong>Auto-sync.</strong> New postings from your subscribed feeds appear in your job list automatically.</li>
          <li><strong>Unsubscribe.</strong> Click <em>Unsubscribe</em> anytime to stop a feed.</li>
        </ol>
      </details>

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
            <div className="channels-right-head">
              <h2>Available feeds ({availableTotal})</h2>
              <div className="search channels-search">
                <IconSearch style={{ color: "var(--muted)", flex: "none" }} />
                <input
                  placeholder="Search feeds…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search available feeds"
                />
              </div>
            </div>
            {availableTotal === 0 ? (
              <div className="empty-mini">You&apos;re subscribed to every feed. 🎉</div>
            ) : available.length === 0 ? (
              <div className="empty-mini">No feeds match “{search}”.</div>
            ) : (
              <div className="channel-grid">
                {available.map((ch) => (
                  <div className="channel-card" key={ch.username}>
                    <div className="channel-top">
                      <h3>{ch.label}</h3>
                      <span
                        className="count-badge"
                        title={`${ch.subscribers} subscriber${ch.subscribers === 1 ? "" : "s"}`}
                      >
                        <IconUsers width={12} height={12} />
                        {ch.subscribers}
                      </span>
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
