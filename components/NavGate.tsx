"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the app chrome on driver-facing pages. A driver arrives from a text
 * message with no account; app navigation would only offer them dead ends.
 */
export default function NavGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/checkin")) return null;
  return <>{children}</>;
}
