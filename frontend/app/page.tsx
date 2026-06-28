export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-16">
      <header className="rounded-glass border border-white/10 bg-white/5 p-8 shadow-glass backdrop-blur">
        <h1 className="text-3xl font-semibold tracking-tight">Glassmorphic CV App</h1>
        <p className="mt-2 text-white/70">
          Frontend scaffold is live. Next steps: auth, dashboard layout, and local engine connection.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-glass border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="text-sm text-white/60">Local engine</div>
          <div className="mt-2 font-medium">ws://localhost:8000/ws/stream</div>
        </div>
        <div className="rounded-glass border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="text-sm text-white/60">Theme</div>
          <div className="mt-2 font-medium">Obsidian + cyan/violet accents</div>
        </div>
        <div className="rounded-glass border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="text-sm text-white/60">Data export</div>
          <div className="mt-2 font-medium">Browser ZIP + Drive upload</div>
        </div>
      </section>
    </main>
  )
}

