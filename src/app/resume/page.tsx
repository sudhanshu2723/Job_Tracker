import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ResumeTailor from "@/components/ResumeTailor";

export default async function ResumePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ResumeTailor username={session.username} />;
}
