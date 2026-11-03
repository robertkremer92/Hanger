"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { checkMessage } from "@/lib/domain/rules";
import { formatWhen } from "@/lib/domain/dates";
import { IconWarn } from "@/components/icons";
import type { Message } from "@/lib/types";
import { sendMessage } from "./actions";

export function Chat({ listingId, buyerId, userId, initial }: { listingId: string; buyerId: string; userId: string; initial: Message[] }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const check = useMemo(() => checkMessage(text), [text]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`thread:${listingId}:${buyerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `listing_id=eq.${listingId}` }, (payload: RealtimePostgresInsertPayload<Message & Record<string, unknown>>) => {
        const m = payload.new;
        if (m.buyer_id !== buyerId) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [listingId, buyerId]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || check.kind === "blocked") return;
    setSending(true);
    setError(null);
    const res = await sendMessage({ listingId, buyerId, body });
    setSending(false);
    if (res.error) return setError(res.error);
    const sent = res.message;
    if (sent) setMessages((prev) => (prev.some((x) => x.id === sent.id) ? prev : [...prev, sent]));
    setText("");
  }

  return (
    <>
      <div className="chat" aria-live="polite">
        {messages.length ? null : <div className="msg sys">Stel je vraag. Betaal altijd via de knop Kopen, dan ben je beschermd.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.sender_id === userId ? "me" : "them"}`} title={formatWhen(m.created_at)}>
            {m.body}
            {m.flagged && m.sender_id !== userId ? <div className="small" style={{ marginTop: 4, opacity: 0.75 }}>Let op: dit bericht gaat over betalen of afspreken buiten de app.</div> : null}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="chatbar" onSubmit={submit}>
        {check.kind !== "ok" ? <div className="warnbox" role="status"><IconWarn /><span>{check.reason}</span></div> : null}
        {error ? <p className="err" role="alert">{error}</p> : null}
        <div className="row">
          <label htmlFor="msg" className="sr">Bericht</label>
          <input id="msg" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Schrijf een bericht" autoComplete="off" maxLength={1000} />
          <button className="btn" type="submit" disabled={!text.trim() || check.kind === "blocked" || sending}>Stuur</button>
        </div>
      </form>
    </>
  );
}
