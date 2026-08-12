import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";
import ProjectionClient from "./ProjectionClient";

export default async function ProjectionPage() {
  if (!(await isAuthed())) redirect("/login");
  const bank = await getCurrentBank();
  if (!bank) redirect("/login");

  return <ProjectionClient bankName={bank.name} />;
}
