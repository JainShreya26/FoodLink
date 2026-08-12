import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";
import ChatClient from "./ChatClient";

export default async function ChatPage() {
  if (!(await isAuthed())) redirect("/login");
  const bank = await getCurrentBank();
  if (!bank) redirect("/login");

  return <ChatClient bankName={bank.name} />;
}
