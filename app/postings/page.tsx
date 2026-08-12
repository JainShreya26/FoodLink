import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";
import PostingsClient from "./PostingsClient";

export default async function PostingsPage() {
  if (!(await isAuthed())) redirect("/login");
  const bank = await getCurrentBank();
  if (!bank) redirect("/login");

  return <PostingsClient bankName={bank.name} />;
}
