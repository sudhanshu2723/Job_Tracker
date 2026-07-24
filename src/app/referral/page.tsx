import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ReferralComposer from "@/components/ReferralComposer";

export default async function ReferralPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ReferralComposer username={session.username} />;
}
