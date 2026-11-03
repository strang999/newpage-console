export default function HomePage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio overview</h1>
      <p className="mt-2 max-w-prose text-muted">
        The application shell is running. The dataset, dashboard views and assistant arrive in the next delivery
        units; the streaming endpoint <code>POST /api/chat</code> is already live.
      </p>
    </main>
  );
}
