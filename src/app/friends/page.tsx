import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import FriendsView from "@/components/FriendsView";

export default async function FriendsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <FriendsView username={session.username} />;
}
