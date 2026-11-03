import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { formatEuro } from "@/lib/domain/money";
import type { Category } from "@/lib/domain/rules";
import type { Tone, TimelineStep } from "@/lib/domain/order-view";
import { formatWhen } from "@/lib/domain/dates";
import { photoUrl } from "@/lib/photos";
import { IconBack, IconCheck } from "./icons";

export const CATEGORY_TINT: Record<Category, string> = {
  dames: "#A4677A", heren: "#55708C", tassen: "#7A5534", schoenen: "#55505C", vintage: "#8A7A4F",
};

const tint = (c: string) => ({ "--c": c }) as CSSProperties;

export function PriceTag({ cents, color, big }: { cents: number; color: string; big?: boolean }) {
  return <span className={big ? "tag big" : "tag"} style={tint(color)}>{formatEuro(cents)}</span>;
}

export function Photo({ path, color, className = "", alt = "" }: { path?: string | null; color: string; className?: string; alt?: string }) {
  return (
    <div className={`ph ${className}`} style={tint(color)}>
      {path ? <img src={photoUrl(path)} alt={alt} loading="lazy" /> : null}
    </div>
  );
}

export function TopBar({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <header className="top">
      {back ? <Link className="iconbtn" href={back} aria-label="Terug"><IconBack /></Link> : null}
      <h1 style={back ? undefined : { fontSize: 24, fontWeight: 800 }}>{title}</h1>
      {right}
    </header>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="tl">
      {steps.map((s, i) => (
        <li key={i} className={s.state}>
          <span className="mark">{s.state === "done" ? <IconCheck /> : null}</span>
          <div>
            <div className="t">{s.title}</div>
            {s.detail ? <div className="d">{s.detail}</div> : null}
            {s.at ? <div className="when">{formatWhen(s.at)}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Notice({ tone = "info", icon, children }: { tone?: "info" | "error" | "success"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`note ${tone === "info" ? "" : tone}`} role={tone === "error" ? "alert" : undefined}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
