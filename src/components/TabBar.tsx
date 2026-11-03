"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBox, IconPerson, IconPlus, IconSearch } from "./icons";

const TABS = [
  { href: "/", label: "Ontdek", Icon: IconSearch, match: (p: string) => p === "/" || p.startsWith("/artikel") || p === "/regels" },
  { href: "/verkopen", label: "Verkopen", Icon: IconPlus, match: (p: string) => p.startsWith("/verkopen") },
  { href: "/orders", label: "Orders", Icon: IconBox, match: (p: string) => p.startsWith("/orders") || p.startsWith("/geschil") || p.startsWith("/berichten") },
  { href: "/profiel", label: "Profiel", Icon: IconPerson, match: (p: string) => p.startsWith("/profiel") || p.startsWith("/support") },
];

export function TabBar({ todo }: { todo: number }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Hoofdmenu">
      {TABS.map(({ href, label, Icon, match }) => (
        <Link key={href} href={href} aria-current={match(path) ? "page" : undefined} className="tablink">
          <Icon />
          {label}
          {href === "/orders" && todo > 0 ? <span className="dot" aria-label={`${todo} te doen`}>{todo}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
