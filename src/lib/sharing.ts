import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** The only fields carried over on a share: company, role, link, location. */
type ShareSource = {
  id: string;
  company: string;
  role: string;
  link: string;
  location: string;
};

const SHARE_PICK = {
  id: true,
  company: true,
  role: true,
  link: true,
  location: true,
} as const;

function copyData(app: ShareSource, targetUserId: string, sharedFrom: string) {
  return {
    userId: targetUserId,
    company: app.company,
    role: app.role,
    link: app.link,
    location: app.location,
    source: "",
    dateApplied: "",
    referral: false,
    referrer: "",
    status: "wishlist",
    ctc: "",
    followUp: "",
    notes: "",
    sharedFrom,
    sourceAppId: app.id,
  };
}

/** Accepted-friend user IDs for a given user (both directions). */
export async function friendIdsOf(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
}

export async function existingFriendship(a: string, b: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
}

/**
 * Copy one user's OWN postings into another user's list (deduped by sourceAppId).
 * Optional date window filters by dateApplied, and always includes undated rows.
 */
export async function shareOwnAppsToUser(
  sourceUserId: string,
  sourceUsername: string,
  targetUserId: string,
  opts?: { fromDate?: string; toDate?: string },
): Promise<number> {
  const where: Prisma.ApplicationWhereInput = {
    userId: sourceUserId,
    sharedFrom: null,
  };
  if (opts?.fromDate && opts?.toDate) {
    where.OR = [
      { dateApplied: { gte: opts.fromDate, lte: opts.toDate } },
      { dateApplied: "" },
    ];
  }
  const apps = await prisma.application.findMany({ where, select: SHARE_PICK });
  if (!apps.length) return 0;
  const res = await prisma.application.createMany({
    data: apps.map((a) => copyData(a, targetUserId, sourceUsername)),
    skipDuplicates: true,
  });
  return res.count;
}

/** Mark a friendship accepted and backfill both users' current postings to each other. */
export async function acceptFriendship(
  friendshipId: string,
  requesterId: string,
  addresseeId: string,
): Promise<void> {
  const [requester, addressee] = await Promise.all([
    prisma.user.findUnique({ where: { id: requesterId }, select: { username: true } }),
    prisma.user.findUnique({ where: { id: addresseeId }, select: { username: true } }),
  ]);
  await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: "accepted" },
  });
  if (requester && addressee) {
    await shareOwnAppsToUser(requesterId, requester.username, addresseeId);
    await shareOwnAppsToUser(addresseeId, addressee.username, requesterId);
  }
}

/** Push a single newly-created OWN posting to all accepted friends (continuous sync). */
export async function fanoutToFriends(
  ownerId: string,
  ownerUsername: string,
  app: ShareSource,
): Promise<void> {
  const friends = await friendIdsOf(ownerId);
  if (!friends.length) return;
  await prisma.application.createMany({
    data: friends.map((fid) => copyData(app, fid, ownerUsername)),
    skipDuplicates: true,
  });
}

/** Push many newly-created OWN postings to all accepted friends in one batch. */
export async function fanoutManyToFriends(
  ownerId: string,
  ownerUsername: string,
  apps: ShareSource[],
): Promise<number> {
  if (!apps.length) return 0;
  const friends = await friendIdsOf(ownerId);
  if (!friends.length) return 0;
  const data = friends.flatMap((fid) =>
    apps.map((a) => copyData(a, fid, ownerUsername)),
  );
  const res = await prisma.application.createMany({ data, skipDuplicates: true });
  return res.count;
}
