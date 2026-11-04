import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "./_components/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Operations Console",
  description: "Portfolio performance, forecast attainment and an evidence-citing assistant.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-2.5">
            <p className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <rect width="24" height="24" rx="6" fill="var(--color-accent)" />
                <path d="M5 16l4-5 3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Market Operations Console
            </p>
            <p className="hidden text-xs text-muted sm:block">Synthetic data · USD · through May 2026</p>
          </div>
        </header>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
