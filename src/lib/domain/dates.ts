const TZ = "Europe/Amsterdam";

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  const time = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${day}, ${time}`;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}

/** "nog 2 dagen", "nog 5 uur", "verlopen" */
export function timeLeft(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return "verlopen";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 48) return `nog ${Math.floor(h / 24)} dagen`;
  if (h >= 1) return `nog ${h} uur`;
  return `nog ${Math.max(1, Math.floor(ms / 60_000))} minuten`;
}
