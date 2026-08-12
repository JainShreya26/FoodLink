"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Inventory" },
  { href: "/projection", label: "Projection" },
  { href: "/chat", label: "Chat" },
  { href: "/board", label: "Board" },
  { href: "/requests", label: "Requests" },
] as const;

/**
 * Own line on phones, inline on desktop. Every link looked identical before, so
 * the current section is marked rather than left for the user to work out.
 */
export default function NavLinks() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="no-scrollbar order-last -mx-1 w-full overflow-x-auto sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible">
      <div className="flex items-center gap-1 px-1 sm:gap-2 sm:px-0">
        {LINKS.map(({ href, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-md px-2.5 py-1 text-sm whitespace-nowrap transition ${
                active
                  ? "bg-emerald-900/50 font-medium text-white"
                  : "text-emerald-100 hover:bg-emerald-700/60 hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
