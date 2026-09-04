"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, Landmark } from "lucide-react";

const sections = [
  {
    href: "/referenda",
    label: "Token holders",
    icon: Landmark,
  },
  {
    href: "/fellowship",
    label: "Fellowship",
    icon: BadgeCheck,
  },
] as const;

export function GovernanceNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Governance body"
      className="grid w-full max-w-full grid-cols-2 gap-0.5 overflow-hidden rounded-md border border-line bg-surface-2 p-0.5 sm:w-auto"
    >
      {sections.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] px-2 py-1.5 text-xs transition-colors sm:px-3 ${
              active
                ? "bg-surface font-semibold text-accent-ink shadow-sm ring-1 ring-line"
                : "text-muted hover:bg-surface/70 hover:text-ink"
            }`}
          >
            <Icon size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
