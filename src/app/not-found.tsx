import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">There is nothing at this address.</p>
      <Link href="/" className="mt-4 inline-block rounded-sm px-4 py-2 text-sm font-semibold" style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}>
        Back to the console
      </Link>
    </main>
  );
}
