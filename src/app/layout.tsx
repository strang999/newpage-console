import type { Metadata } from "next";
import type { ReactNode } from "react";
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
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold tracking-tight">Market Operations Console</p>
            <p className="text-xs text-muted">Synthetic data · USD · through May 2026</p>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
