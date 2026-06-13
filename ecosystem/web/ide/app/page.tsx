"use client";

import { useMemo, useState } from "react";

type Doc = { id: string; title: string; content: string };

const seedDocs: Doc[] = [
  { id: "1", title: "scene.game", content: "entity player { transform(0,1,0) }" },
  { id: "2", title: "lighting.qs", content: "sun.intensity = 45.0\nfog.density = 0.002" },
];

export default function Page() {
  const [docs, setDocs] = useState(seedDocs);
  const [selected, setSelected] = useState(seedDocs[0].id);

  const active = useMemo(() => docs.find((doc) => doc.id === selected) ?? docs[0], [docs, selected]);

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <h1 className="text-3xl font-semibold">Quantum Forge Collaborative IDE</h1>
      <p className="mt-2 text-zinc-400">React + Next.js + Tailwind collaborative editing shell.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-[240px_1fr]">
        <aside className="border border-zinc-800 p-3">
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelected(doc.id)}
              className={`block w-full px-3 py-2 text-left text-sm ${
                doc.id === selected ? "bg-zinc-800" : "hover:bg-zinc-900"
              }`}
            >
              {doc.title}
            </button>
          ))}
        </aside>
        <section className="border border-zinc-800 p-3">
          <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">{active.title}</h2>
          <textarea
            value={active.content}
            onChange={(event) => {
              const next = docs.map((doc) =>
                doc.id === active.id ? { ...doc, content: event.target.value } : doc
              );
              setDocs(next);
            }}
            className="mt-3 h-96 w-full resize-none bg-zinc-950 p-4 font-mono text-sm outline-none"
          />
        </section>
      </div>
    </main>
  );
}
