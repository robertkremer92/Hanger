import Link from "next/link";

export default function NotFound() {
  return (
    <main className="stack" style={{ paddingTop: 48 }}>
      <h1 className="h1">Deze pagina bestaat niet (meer).</h1>
      <p className="muted">Misschien is het artikel verkocht of verwijderd.</p>
      <Link className="btn" href="/">Naar Ontdek</Link>
    </main>
  );
}
