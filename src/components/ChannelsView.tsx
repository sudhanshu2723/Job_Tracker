"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendFriendRequest, removeFriend } from "@/lib/social";
import { IconArrowLeft, IconCheck, IconPlus, IconBell } from "./icons";

interface ChannelStat {
  username: string;
  label: string;
  description: string;
  totalJobs: number;
  subscribed: boolean;
  friendshipId: string | null;
  myCount: number;
}

interface Toast {
  id: number;
  text: string;
  tone: "info" | "success" | "error";
}

export default function ChannelsView({ username }: { username: string }) {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelStat[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  function addToast(text: string, tone: Toast["tone"] = "info") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }

  async function subscribe(ch: ChannelStat) {
    setBusy(ch.username);
    addToast(`Subscribing to ${ch.label}…`, "info");
    try {
      await sendFriendRequest(ch.username);
      addToast(`Subscribed to ${ch.label}`, "success");
      await reload();
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Subscribe failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function unsubscribe(ch: ChannelStat) {
    if (!ch.friendshipId) return;
    setBusy(ch.username);
    addToast(`Unsubscribing from ${ch.label}…`, "info");
    try {
      await removeFriend(ch.friendshipId);
      addToast(`Unsubscribed from ${ch.label}`, "success");
      await reload();
    } catch {
      addToast("Unsubscribe failed", "error");
    } finally {
      setBusy(null);
    }
  }

  const subscribed = (channels ?? []).filter((c) => c.subscribed);
  const available = (channels ?? []).filter((c) => !c.subscribed);

  return (
    <div className="channels-page">
      <header className="channels-head">
        <button className="btn btn-icon btn-ghost" onClick={() => router.push("/")} aria-label="Back to dashboard" title="Back to dashboard">
          <IconArrowLeft />
        </button>
        <div>
          <h1>Job feed channels</h1>
          <p>Subscribe to a feed and its postings sync into your list automatically.</p>
        </div>
      </header>

      {error && <div className="auth-error">{error}</div>}
      {!channels && !error && <div className="empty-mini">Loading feeds…</div>}

      {channels && (
        <>
          <section className="channel-section">
            <h2>Your feeds ({subscribed.length})</h2>
            {subscribed.length === 0 ? (
              <div className="empty-mini">
                You haven&apos;t subscribed to any feed yet — pick one below.
              </div>
            ) : (
              <div className="channel-grid">
                {subscribed.map((ch) => (
                  <div className="channel-card" key={ch.username}>
                    <div className="channel-top">
                      <h3>{ch.label}</h3>
                      <span className="sub-badge">
                        <IconCheck width={13} height={13} /> Subscribed
                      </span>
                    </div>
                    <p className="desc">{ch.description}</p>
                    <div className="channel-stat">
                      <span className="num">{ch.myCount}</span> postings brought in
                      <span className="stat-sub"> · {ch.totalJobs} in the feed</span>
                    </div>
                    <div className="channel-actions">
                      <button className="btn btn-ghost" onClick={() => router.push("/")}>
                        View in dashboard →
                      </button>
                      <button
                        className="btn btn-ghost btn-danger"
                        onClick={() => unsubscribe(ch)}
                        disabled={busy === ch.username}
                      >
                        Unsubscribe
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="channel-section">
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
          </section>
        </>
      )}

      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast toast-${t.tone}`} key={t.id}>
            {t.tone === "success" ? (
              <IconCheck width={15} height={15} />
            ) : (
              <IconBell width={14} height={14} />
            )}
            {t.text}
          </div>
        ))}
      </div>

      <div className="hint" style={{ marginTop: 26 }}>
        Signed in as <strong style={{ color: "var(--ink-2)", marginLeft: 4 }}>{username}</strong>
      </div>
    </div>
  );
}
