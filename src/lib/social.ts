export interface IncomingInvite {
  id: string;
  from: string;
  fromDate: string;
  toDate: string;
}
export interface OutgoingInvite {
  id: string;
  to: string;
  fromDate: string;
  toDate: string;
}
export interface FriendItem {
  id: string;
  username: string;
}
export interface IncomingFriend {
  id: string;
  from: string;
}
export interface OutgoingFriend {
  id: string;
  to: string;
}

export interface InvitesResponse {
  incoming: IncomingInvite[];
  outgoing: OutgoingInvite[];
}
export interface FriendsResponse {
  friends: FriendItem[];
  incoming: IncomingFriend[];
  outgoing: OutgoingFriend[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return res.json() as Promise<T>;
}

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const getInvites = () =>
  fetch("/api/invites", { cache: "no-store" }).then(j<InvitesResponse>);
export const sendInvite = (toUsername: string, fromDate: string, toDate: string) =>
  post("/api/invites", { toUsername, fromDate, toDate }).then(j<{ ok: true }>);
export const acceptInvite = (id: string) =>
  post(`/api/invites/${id}/accept`).then(j<{ ok: true; copied: number }>);
export const declineInvite = (id: string) =>
  post(`/api/invites/${id}/decline`).then(j<{ ok: true }>);

export const getFriends = () =>
  fetch("/api/friends", { cache: "no-store" }).then(j<FriendsResponse>);
export const sendFriendRequest = (toUsername: string) =>
  post("/api/friends", { toUsername }).then(j<{ ok: true; becameFriends?: boolean }>);
export const acceptFriend = (id: string) =>
  post(`/api/friends/${id}/accept`).then(j<{ ok: true }>);
export const removeFriend = (id: string) =>
  fetch(`/api/friends/${id}`, { method: "DELETE" }).then(j<{ ok: true }>);
