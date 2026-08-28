import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-[70vh] flex-col justify-center gap-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-turf">Phase 0.2</p>
      <h1 className="text-4xl font-semibold tracking-tight">SundayStack</h1>
      <p className="max-w-lg text-sm leading-6 text-zinc-400">
        Create a league, invite a second manager, fill a roster from the NFL player pool. Scoring
        rules are stored now; weekly points come later.
      </p>
      <div className="flex gap-3 text-sm">
        <Link
          href="/login"
          className="rounded bg-turf px-3 py-1.5 font-medium text-ink hover:bg-emerald-400"
        >
          Dev sign in
        </Link>
        <Link href="/leagues" className="rounded border border-line px-3 py-1.5 hover:border-turf">
          Leagues
        </Link>
      </div>
    </main>
  );
}
