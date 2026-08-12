import { cookies } from "next/headers";

// Hardcoded demo credentials — replace with real auth later.
export const ADMIN_USER = "admin";
export const ADMIN_PASSWORD = "admin123";

export async function isAuthed(): Promise<boolean> {
  return (await cookies()).get("auth")?.value === "ok";
}
