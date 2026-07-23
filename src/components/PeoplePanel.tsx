"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getInvites,
  getFriends,
  sendInvite,
  sendFriendRequest,
  acceptInvite,
  declineInvite,
  acceptFriend,
  removeFriend,
  type InvitesResponse,
  type FriendsResponse,
} from "@/lib/social";
import { CHANNEL_USERNAMES } from "@/lib/channelsMeta";
import { IconClose } from "./icons";

interface Props {
  onClose: () => void;
  /** Called after any action that may change the user's own applications or badge. */
  onChanged: () => void;
}

export function PeoplePanel({ onClose, onChanged }: Props) {
  const [invites, setInvites] = useState<InvitesResponse | null>(null);
  const [friends, setFriends] = useState<FriendsResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [invUser, setInvUser] = useState("");
  const [invFrom, setInvFrom] = useState("");
  const [invTo, setInvTo] = useState("");
  const [friendUser, setFriendUser] = useState("");

  const reload = useCallback(async () => {
    const [i, f] = await Promise.all([getInvites(), getFriends()]);
    setInvites(i);
    setFriends(f);
  }, []);

  useEffect(() => {
    reload().catch(() => setError("Couldn't load your people."));
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn: () => Promise<unknown>, successMsg?: string) {
    setError("");
    setNotice("");
    try {
      await fn();
      await reload();
      onChanged();
      if (successMsg) setNotice(successMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  const incomingInvites = invites?.incoming ?? [];
  const incomingFriends = friends?.incoming ?? [];
  const outgoingInvites = invites?.outgoing ?? [];
  const outgoingFriends = friends?.outgoing ?? [];
  const friendList = friends?.friends ?? [];
  const humanFriends = friendList.filter((f) => !CHANNEL_USERNAMES.has(f.username));
  const hasRequests = incomingInvites.length + incomingFriends.length > 0;
  const hasPending = outgoingInvites.length + outgoingFriends.length > 0;

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="People and sharing"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>People &amp; Sharing</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className="people-body">
          {error && <div className="auth-error">{error}</div>}
          {notice && (
            <div className="auth-error" style={{ color: "var(--good)", background: "color-mix(in srgb, var(--good) 12%, transparent)" }}>
              {notice}
            </div>
          )}

          {/* Requests for you */}
          <section className="people-section">
            <h3>Requests for you</h3>
            {!hasRequests && <div className="empty-mini">No pending requests.</div>}

            {incomingFriends.map((r) => (
              <div className="req-item" key={r.id}>
                <div className="grow">
                  <span className="who">{r.from}</span>
                  <div className="req-sub">wants to be friends — postings will sync both ways</div>
                </div>
                <button className="btn btn-primary" onClick={() => run(() => acceptFriend(r.id), `You and ${r.from} are now friends.`)}>
                  Accept
                </button>
                <button className="btn btn-ghost" onClick={() => run(() => removeFriend(r.id))}>
                  Decline
                </button>
              </div>
            ))}

            {incomingInvites.map((r) => (
              <div className="req-item" key={r.id}>
                <div className="grow">
                  <span className="who">{r.from}</span>
                  <div className="req-sub">
                    wants your postings from {r.fromDate} to {r.toDate}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => run(() => acceptInvite(r.id), `Shared your postings with ${r.from}.`)}>
                  Accept
                </button>
                <button className="btn btn-ghost" onClick={() => run(() => declineInvite(r.id))}>
                  Decline
                </button>
              </div>
            ))}
          </section>

          {/* Friends */}
          <section className="people-section">
            <h3>Your friends ({humanFriends.length})</h3>
            {humanFriends.length === 0 ? (
              <div className="empty-mini">No friends yet. Add one below to start syncing postings.</div>
            ) : (
              <div className="friend-tags">
                {humanFriends.map((f) => (
                  <span className="friend-tag" key={f.id}>
                    {f.username}
                    <button
                      className="btn btn-icon btn-ghost btn-danger"
                      title="Unfriend"
                      aria-label={`Unfriend ${f.username}`}
                      onClick={() => run(() => removeFriend(f.id))}
                    >
                      <IconClose width={13} height={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Add a friend */}
          <section className="people-section">
            <h3>Add a friend</h3>
            <p className="people-note">
              Once you&apos;re both friends, every new posting either of you adds syncs to the other as a Wishlist item — continuously.
            </p>
            <form
              className="mini-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!friendUser.trim()) return;
                run(() => sendFriendRequest(friendUser.trim()), "Friend request sent.").then(() =>
                  setFriendUser(""),
                );
              }}
            >
              <div className="field">
                <input
                  placeholder="their username"
                  value={friendUser}
                  onChange={(e) => setFriendUser(e.target.value)}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              <button className="btn btn-primary" type="submit">
                Send request
              </button>
            </form>
          </section>

          {/* Invite to import */}
          <section className="people-section">
            <h3>Invite someone to share their postings</h3>
            <p className="people-note">
              A one-time pull: when they accept, their postings in the date window arrive in your list as Wishlist items (company, role, link &amp; location only).
            </p>
            <form
              className="mini-form invite"
              onSubmit={(e) => {
                e.preventDefault();
                if (!invUser.trim() || !invFrom || !invTo) return;
                run(
                  () => sendInvite(invUser.trim(), invFrom, invTo),
                  "Invite sent.",
                ).then(() => {
                  setInvUser("");
                  setInvFrom("");
                  setInvTo("");
                });
              }}
            >
              <div className="field">
                <label>Username</label>
                <input
                  placeholder="their username"
                  value={invUser}
                  onChange={(e) => setInvUser(e.target.value)}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label>From</label>
                <input type="date" value={invFrom} onChange={(e) => setInvFrom(e.target.value)} />
              </div>
              <div className="field">
                <label>To</label>
                <input type="date" value={invTo} onChange={(e) => setInvTo(e.target.value)} />
              </div>
              <button className="btn btn-primary" type="submit">
                Send
              </button>
            </form>
          </section>

          {/* Pending sent */}
          {hasPending && (
            <section className="people-section">
              <h3>Pending (sent by you)</h3>
              {outgoingFriends.map((r) => (
                <div className="req-item" key={r.id}>
                  <div className="grow">
                    <span className="who">{r.to}</span>
                    <div className="req-sub">friend request — awaiting response</div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => run(() => removeFriend(r.id))}>
                    Cancel
                  </button>
                </div>
              ))}
              {outgoingInvites.map((r) => (
                <div className="req-item" key={r.id}>
                  <div className="grow">
                    <span className="who">{r.to}</span>
                    <div className="req-sub">
                      import invite ({r.fromDate} → {r.toDate}) — awaiting response
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
