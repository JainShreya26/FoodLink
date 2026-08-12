import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getCurrentBank } from "@/lib/session";
import BoardClient from "./BoardClient";

export default async function BoardPage() {
  if (!(await isAuthed())) redirect("/login");
  const bank = await getCurrentBank();
  if (!bank) redirect("/login");

  return <BoardClient bankName={bank.name} />;
}
