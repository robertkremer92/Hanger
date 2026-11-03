"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="stack" style={{ paddingTop: 48 }}>
      <h1 className="h1">Deze pagina kon niet laden.</h1>
      <p className="muted">Controleer je verbinding en probeer het opnieuw. Blijft het misgaan, laat het ons weten via Profiel.</p>
      <button className="btn" onClick={reset}>Opnieuw proberen</button>
    </main>
  );
}
