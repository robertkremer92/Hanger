"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { SHIPPING, allInCents, formatEuro, type ShippingMethod } from "@/lib/domain/money";
import { startCheckout } from "./actions";

export function BuySheet({ listingId, priceCents, pickupCity, loggedIn }: { listingId: string; priceCents: number; pickupCity: string | null; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<ShippingMethod>("postnl");
  const router = useRouter();
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    sheet.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const options: ShippingMethod[] = pickupCity ? ["postnl", "dhl", "pickup"] : ["postnl", "dhl"];
  const total = allInCents(priceCents) + SHIPPING[method].cents;

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  return (
    <>
      <button ref={opener} className="btn" type="button" onClick={() => (loggedIn ? setOpen(true) : router.push(`/login?next=/artikel/${listingId}`))}>
        Kopen
      </button>
      <div className={`scrim ${open ? "open" : ""}`} onClick={close} aria-hidden />
      <div ref={sheet} className={`sheet ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="buyTitle" inert={!open}>
        <div className="grab" aria-hidden />
        <ActionForm action={startCheckout}>
          <h2 id="buyTitle">Afrekenen</h2>
          <input type="hidden" name="listingId" value={listingId} />
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Hoe wil je het ontvangen?</legend>
            {options.map((m) => (
              <label key={m} className="choice">
                <input type="radio" name="shipping" value={m} checked={method === m} onChange={() => setMethod(m)} />
                <span style={{ flex: 1 }}>
                  <span className="spread">
                    <span className="t">{SHIPPING[m].label}{m === "pickup" ? ` in ${pickupCity}` : ""}</span>
                    <span className="num">{SHIPPING[m].cents ? formatEuro(SHIPPING[m].cents) : "Gratis"}</span>
                  </span>
                  <span className="d">{SHIPPING[m].detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="lines panel" style={{ margin: 0 }}>
            <div className="spread"><span>Artikel, alles-in</span><span>{formatEuro(allInCents(priceCents))}</span></div>
            <div className="spread"><span>Verzending</span><span>{SHIPPING[method].cents ? formatEuro(SHIPPING[method].cents) : "Gratis"}</span></div>
            <div className="spread total"><span>Totaal</span><span>{formatEuro(total)}</span></div>
          </div>
          <p className="small muted">Je betaalt nu. Het geld gaat pas naar de verkoper als jij bevestigt dat alles klopt, of als de controletermijn zonder melding voorbij is.</p>
          <SubmitButton pending="Naar betalen">Betaal {formatEuro(total)}</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
