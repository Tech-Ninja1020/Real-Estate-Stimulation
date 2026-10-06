"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Wordmark } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { useScenario } from "@/lib/scenario-store";

const NAV = [
  { href: "/", label: "Setup" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/lab", label: "Scenario Lab" },
  { href: "/summary", label: "Summary" },
  { href: "/assumptions", label: "Assumptions" },
] as const;

function CopyLinkButton() {
  const { status, shareUrl } = useScenario();
  const [copied, setCopied] = useState(false);
  if (status !== "ready") return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", shareUrl());
    }
  };
  return (
    <button
      onClick={copy}
      aria-live="polite"
      className="border-line text-ink-2 hover:bg-surface-2 hover:text-ink hidden items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition sm:inline-flex"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.7.7M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.7-.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { household, status } = useScenario();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-3 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="no-print border-line sticky top-0 z-40 border-b bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[88rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="HoldSellSwap home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav
            aria-label="Primary"
            className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-sm whitespace-nowrap transition",
                    active ? "bg-surface-2 text-ink font-medium" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {status === "ready" && household && (
            <span
              className="text-ink-3 hidden max-w-[14rem] truncate text-xs lg:block"
              title={household.name}
            >
              {household.name}
            </span>
          )}
          <CopyLinkButton />
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-[88rem] flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      >
        {children}
      </main>
      <footer className="no-print border-line border-t">
        <div className="text-ink-3 mx-auto flex max-w-[88rem] flex-col gap-2 px-4 py-6 text-xs leading-relaxed sm:px-6 lg:px-8">
          <p>
            <strong className="text-ink-2 font-semibold">
              Educational simulation, not tax or investment advice.
            </strong>{" "}
            HoldSellSwap models simplified U.S. federal and flat state tax rules. It does not model
            passive loss limits, AMT, the Section 121 exclusion, installment sales or cost
            segregation. Consult a qualified tax professional before acting.
          </p>
          <p>
            <Link
              href="/assumptions"
              className="hover:text-ink underline decoration-dotted underline-offset-2"
            >
              Read every assumption
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
