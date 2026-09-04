"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ListChecks, Moon, Plus, Sun } from "lucide-react";
import { useApi } from "@/lib/chain/ApiProvider";
import { WalletButton } from "@/components/WalletButton";
import { Logo, LogoMark } from "@/components/Logo";
import { BlockTicker } from "@/components/BlockTicker";

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // Sync with the class the inline <head> script set before hydration;
    // reading document during render would cause a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.theme = next ? "dark" : "light";
    } catch {}
  };
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="btn btn-ghost h-9 w-9 !p-0 text-muted hover:text-ink"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function BlockIndicator() {
  const { connected, finalizedNumber } = useApi();
  return (
    <span
      className="hidden h-9 items-center gap-2 border-x border-line px-3.5 text-xs text-muted md:flex"
      title={connected ? "Finalized block (live)" : "Connecting to Vara RPC…"}
    >
      <span
        className={`live-dot h-1.5 w-1.5 rounded-full ${
          connected ? "bg-accent" : "bg-warn"
        }`}
      />
      {finalizedNumber !== null ? (
        <BlockTicker value={finalizedNumber} />
      ) : (
        "connecting"
      )}
    </span>
  );
}

function NavLink({
  href,
  children,
  activePrefixes = [],
}: {
  href: string;
  children: React.ReactNode;
  activePrefixes?: string[];
}) {
  const pathname = usePathname();
  const active =
    pathname === href ||
    pathname.startsWith(href + "/") ||
    activePrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
    );
  return (
    <Link
      href={href}
      className={`relative flex items-center whitespace-nowrap rounded-sm px-2 py-1.5 text-sm transition-colors duration-150 sm:px-3 ${
        active ? "font-medium text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-2.5 -bottom-[11px] h-[2px] bg-accent sm:inset-x-3" />
      )}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const isFellowship = pathname === "/fellowship" || pathname.startsWith("/fellowship/");

  return (
    <header className="rule-double sticky top-0 z-(--z-sticky) bg-bg/90 backdrop-blur-md">
      <div className="relative mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-3 sm:gap-4 sm:px-4">
        <Link href="/referenda" aria-label="VaraGov home" className="sm:mr-2">
          <span className="sm:hidden">
            <LogoMark size={26} />
          </span>
          <span className="hidden sm:block">
            <Logo />
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1">
          <NavLink href="/referenda" activePrefixes={["/fellowship"]}>
            <span className="sm:hidden">Gov</span>
            <span className="hidden sm:inline">Governance</span>
          </NavLink>
          <NavLink href="/votes">
            <ListChecks size={17} className="sm:hidden" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">My votes</span>
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 max-sm:absolute max-sm:right-3 sm:gap-2.5">
          <BlockIndicator />
          {!isFellowship && (
            <Link href="/new" className="btn btn-primary h-9 !px-3.5">
              <Plus size={15} strokeWidth={2.5} />
              <span className="hidden sm:inline">New proposal</span>
            </Link>
          )}
          <WalletButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
