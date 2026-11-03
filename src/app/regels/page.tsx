import type { Metadata } from "next";
import { RULES } from "@/lib/domain/rules";
import { TopBar } from "@/components/ui";

export const metadata: Metadata = { title: "Zo beslissen wij" };

export default function Regels() {
  return (
    <>
      <TopBar title="Zo beslissen wij" back="/" />
      <main className="stack">
        <p>Dit zijn de regels waar elke medewerker zich aan houdt. In elk besluit staat welke regel is toegepast.</p>
        <ol className="rules">
          {RULES.map((r) => (
            <li key={r.no} id={`regel-${r.no}`}><span className="no">{r.no}</span><span>{r.text}</span></li>
          ))}
        </ol>
      </main>
    </>
  );
}
