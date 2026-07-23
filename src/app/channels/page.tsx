import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ChannelsView from "@/components/ChannelsView";

export default async function ChannelsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ChannelsView username={session.username} />;
}
