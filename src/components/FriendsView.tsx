"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getFriends,
  searchPeople,
  sendFriendRequest,
  acceptFriend,
  removeFriend,
  type FriendItem,
  type IncomingFriend,
  type OutgoingFriend,
  type PersonResult,
} from "@/lib/social";
import { useToast } from "./Toast";
import { Spinner } from "./Spinner";
import { IconArrowLeft, IconPlus, IconSearch, IconCheck } from "./icons";
import { CHANNEL_USERNAMES } from "@/lib/channelsMeta";

const MIN_CHARS = 2;

export default function FriendsView({ username }: { username: string }) {
  const router = useRouter();
  const toast = useToast();

  const [friends, setFriends] = useState<FriendItem[] | null>(null);
  const [incoming, setIncoming] = useState<IncomingFriend[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingFriend[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await getFriends();
      // Channel subscriptions are also friendships with bot accounts — keep those
      // out of the people-focused Friends page.
      setFriends(data.friends.filter((f) => !CHANNEL_USERNAMES.has(f.username)));
      setIncoming(data.incoming.filter((r) => !CHANNEL_USERNAMES.has(r.from)));
      setOutgoing(data.outgoing.filter((r) => !CHANNEL_USERNAMES.has(r.to)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load friends.");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Instagram-style: only search once a couple of letters are typed, debounced.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const { users } = await searchPeople(q.trim());
      setResults(users);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  async function refresh() {
    // Parallel — halves the wait vs sequential round-trips to the DB.
    await Promise.all([reload(), runSearch(query)]);
  }

  async function run(name: string, fn: () => Promise<unknown>, ok: string, fail: string) {
    setBusy(name);
    try {
      await fn();
      toast(ok, "success");
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : fail, "error");
      await refresh(); // resync the UI to the true server state after a failure
    } finally {
      setBusy(null);
    }
  }

  const add = (p: PersonResult) => {
    // Optimistic: flip the button to "Requested" instantly; refresh confirms it.
    setResults((rs) =>
      rs.map((r) => (r.username === p.username ? { ...r, relationship: "outgoing" } : r)),
    );
    return run(p.username, () => sendFriendRequest(p.username), `Request sent to ${p.username}`, "Couldn't send request");
  };
  const accept = (id: string, name: string) =>
    run(name, () => acceptFriend(id), `You're now friends with ${name}`, "Couldn't accept");
  const decline = (id: string, name: string) =>
    run(name, () => removeFriend(id), `Declined request from ${name}`, "Couldn't decline");
  const cancel = (id: string, name: string) =>
    run(name, () => removeFriend(id), `Withdrew request to ${name}`, "Couldn't withdraw");
  const unfriend = (id: string, name: string) =>
    run(name, () => removeFriend(id), `Removed ${name}`, "Couldn't remove friend");

  const trimmed = query.trim();

  function row(name: string, action: React.ReactNode) {
    return (
      <div className="person-row" key={name}>
        <span className="person-avatar">{name.slice(0, 1).toUpperCase()}</span>
        <span className="person-name" title={name}>
          {name}
        </span>
        <div className="person-row-action">{action}</div>
      </div>
    );
  }

  function searchAction(p: PersonResult) {
    if (p.relationship === "friends")
      return (
        <span className="person-status">
          <IconCheck width={13} height={13} /> Friends
        </span>
      );
    if (p.relationship === "outgoing")
      return (
        <button
          className="btn"
          disabled={busy === p.username}
          onClick={() => p.friendshipId && cancel(p.friendshipId, p.username)}
        >
          Requested · Cancel
        </button>
      );
    if (p.relationship === "incoming")
      return (
        <button
          className="btn btn-primary"
          disabled={busy === p.username}
          onClick={() => p.friendshipId && accept(p.friendshipId, p.username)}
        >
          <IconCheck width={15} height={15} /> Accept
        </button>
      );
    return (
      <button
        className="btn btn-primary"
        disabled={busy === p.username}
        onClick={() => add(p)}
      >
        <IconPlus width={15} height={15} /> Add
      </button>
    );
  }

  return (
    <div className="friends-wrap">
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
          <h1>Friends</h1>
          <p>Connect with people — their shared applications sync into your list.</p>
        </div>
      </header>

      <details className="how-box" open>
        <summary>What this is &amp; how to use it</summary>
        <p className="how-lead">
          Connect with friends to see where they&apos;re applying. Once you&apos;re friends, the job applications they&apos;ve chosen to share
          automatically show up in your list — handy for swapping referrals and following each other&apos;s job hunt.
        </p>
        <ol>
          <li><strong>Search.</strong> Type a friend&apos;s username in the search box.</li>
          <li><strong>Add.</strong> Hit <em>Add</em> to send them a friend request.</li>
          <li><strong>Accept.</strong> When someone requests you, <em>Accept</em> (or decline) it from the requests list.</li>
          <li><strong>Sync.</strong> Your friends&apos; shared applications appear in your list automatically.</li>
          <li><strong>Manage.</strong> Remove a friend anytime to stop syncing.</li>
        </ol>
      </details>

      {error && <div className="auth-error">{error}</div>}
      {!friends && !error && <Spinner label="Loading friends…" full />}

      {friends && (
        <>
          {/* Requests received — full-width strip above the columns */}
          {incoming.length > 0 && (
            <section className="fr-section">
              <h2 className="fr-heading">Friend requests · {incoming.length}</h2>
              <div className="person-list">
                {incoming.map((r) =>
                  row(
                    r.from,
                    <>
                      <button
                        className="btn btn-primary"
                        onClick={() => accept(r.id, r.from)}
                        disabled={busy === r.from}
                      >
                        Accept
                      </button>
                      <button
                        className="btn btn-ghost btn-danger"
                        onClick={() => decline(r.id, r.from)}
                        disabled={busy === r.from}
                      >
                        Reject
                      </button>
                    </>,
                  ),
                )}
              </div>
            </section>
          )}

          <div className="fr-columns">
            {/* Column 1 — Find people */}
            <section className="fr-col">
              <h2 className="fr-heading">Find people</h2>
              <div className="search fr-search">
                <IconSearch style={{ color: "var(--muted)", flex: "none" }} />
                <input
                  placeholder="Search by username…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search people"
                />
              </div>
              {trimmed.length < MIN_CHARS ? (
                <div className="empty-mini">Type at least {MIN_CHARS} letters to find people.</div>
              ) : searching ? (
                <Spinner label="Searching…" />
              ) : results.length === 0 ? (
                <div className="empty-mini">No people match “{trimmed}”.</div>
              ) : (
                <div className="person-list">{results.map((p) => row(p.username, searchAction(p)))}</div>
              )}
            </section>

            {/* Column 2 — People you follow */}
            <section className="fr-col">
              <h2 className="fr-heading">Your friends · {friends.length}</h2>
              {friends.length === 0 ? (
                <div className="empty-mini">No friends yet — search to connect.</div>
              ) : (
                <div className="person-list">
                  {friends.map((f) =>
                    row(
                      f.username,
                      <button
                        className="btn btn-ghost btn-danger"
                        onClick={() => unfriend(f.id, f.username)}
                        disabled={busy === f.username}
                      >
                        Unfriend
                      </button>,
                    ),
                  )}
                </div>
              )}
            </section>

            {/* Column 3 — Requests you've sent */}
            <section className="fr-col">
              <h2 className="fr-heading">Requests sent · {outgoing.length}</h2>
              {outgoing.length === 0 ? (
                <div className="empty-mini">No pending requests you&apos;ve sent.</div>
              ) : (
                <div className="person-list">
                  {outgoing.map((r) =>
                    row(
                      r.to,
                      <button
                        className="btn"
                        onClick={() => cancel(r.id, r.to)}
                        disabled={busy === r.to}
                        title="Withdraw your request"
                      >
                        Cancel
                      </button>,
                    ),
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <div className="hint" style={{ marginTop: 28 }}>
        Signed in as <strong style={{ color: "var(--ink-2)", marginLeft: 4 }}>{username}</strong>
      </div>
    </div>
  );
}
