const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-turf">Phase 0.1</p>
      <h1 className="text-4xl font-semibold tracking-tight">SundayStack</h1>
      <p className="max-w-xl text-sm leading-6 text-zinc-400">
        Foundation is API-first. Player search lives on Express, not in this Next.js app. UI comes
        after ingest and <code className="text-zinc-200">GET /api/players</code> return real NFL
        rows.
      </p>
      <div className="rounded-md border border-line bg-panel p-4 font-mono text-xs leading-6 text-zinc-300">
        <div>{apiUrl}/health</div>
        <div>{apiUrl}/api/players?search=mahomes&position=QB</div>
        <div>{apiUrl}/api/players?team=KC&limit=10</div>
      </div>
    </main>
  );
}
