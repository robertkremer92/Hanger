"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { allInCents, formatEuro, parseEuroInput } from "@/lib/domain/money";
import { CATEGORIES, CONDITIONS, isRiskBrand } from "@/lib/domain/rules";
import { IconCamera, IconCheck, IconShield } from "@/components/icons";
import { prepareImage } from "@/lib/image";
import { createDraft, publishDraft } from "./actions";

type Picked = { file: File; preview: string };
const MAX_PHOTOS = 8;

export function SellForm({ userId, disabled }: { userId: string; disabled: boolean }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [label, setLabel] = useState<Picked | null>(null);
  const [serial, setSerial] = useState<Picked | null>(null);
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");
  const [pickup, setPickup] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const risky = isRiskBrand(brand);
  const cents = useMemo(() => parseEuroInput(price), [price]);

  function pick(files: FileList | null): Picked[] {
    return [...(files ?? [])].filter((f) => f.type.startsWith("image/")).map((file) => ({ file, preview: URL.createObjectURL(file) }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!photos.length) return fail("Voeg minstens één foto toe.", "photos");
    if (risky && (!label || !serial)) return fail("Voeg een foto van het label en van de serie- of datumcode toe om dit merk te plaatsen.", "proof");

    const f = new FormData(e.currentTarget);
    setBusy("Advertentie opslaan");
    const draft = await createDraft({
      title: f.get("title"), brand, size: f.get("size"), category: f.get("category"), condition: f.get("condition"),
      description: f.get("description") ?? "", price, allowsFitReturns: f.get("returns") === "on",
      allowsPickup: pickup, pickupCity: f.get("pickupCity") ?? "",
    });
    if (draft.error || !draft.id) return fail(draft.error ?? "Opslaan mislukt.", draft.field);

    const supabase = createClient();
    const uploads: { file: File; kind: "main" | "label" | "serial"; position: number }[] = [
      ...photos.map((p, i) => ({ file: p.file, kind: "main" as const, position: i })),
      ...(risky && label ? [{ file: label.file, kind: "label" as const, position: 0 }] : []),
      ...(risky && serial ? [{ file: serial.file, kind: "serial" as const, position: 0 }] : []),
    ];
    try {
      let done = 0;
      for (const u of uploads) {
        setBusy(`Foto's uploaden (${++done} van ${uploads.length})`);
        const blob = await prepareImage(u.file);
        const ext = blob.type === "image/jpeg" ? "jpg" : (u.file.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `${userId}/${draft.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("listing-photos").upload(path, blob, { contentType: blob.type || u.file.type, upsert: false });
        if (up.error) throw new Error("Een foto kon niet worden geüpload. Controleer je verbinding en probeer het opnieuw.");
        const row = await supabase.from("listing_photos").insert({ listing_id: draft.id, path, kind: u.kind, position: u.position });
        if (row.error) throw new Error("Een foto kon niet worden opgeslagen. Probeer het opnieuw.");
      }
    } catch (err) {
      return fail((err as Error).message);
    }

    setBusy("Plaatsen");
    const published = await publishDraft(draft.id);
    if (published.error) return fail(published.error);
    router.push(`/artikel/${draft.id}?geplaatst=1`);
  }

  function fail(message: string, field?: string) {
    setBusy(null);
    setError({ message, field });
    const el = field ? formRef.current?.querySelector<HTMLElement>(`[name="${field}"], #${field}`) : null;
    (el ?? formRef.current?.querySelector<HTMLElement>("[role=alert]"))?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const fieldError = (name: string) => (error?.field === name ? <span className="err" role="alert">{error.message}</span> : null);

  return (
    <form ref={formRef} className="stack" onSubmit={onSubmit} noValidate aria-disabled={disabled}>
      <fieldset disabled={disabled || Boolean(busy)} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="field">
          <span className="label" id="photos">Foto&apos;s</span>
          <div className="photos">
            {photos.map((p, i) => (
              <button key={p.preview} type="button" className="slot" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label={`Foto ${i + 1} verwijderen`} style={{ padding: 0, cursor: "pointer" }}>
                <img src={p.preview} alt="" />
              </button>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <label className="add" htmlFor="photoInput"><IconCamera />Foto toevoegen</label>
            ) : null}
          </div>
          <input id="photoInput" type="file" accept="image/*" multiple className="sr"
            onChange={(e) => { setPhotos([...photos, ...pick(e.target.files)].slice(0, MAX_PHOTOS)); e.target.value = ""; }} />
          {fieldError("photos") ?? <span className="hint">Daglicht en een effen achtergrond. Laat ook eventuele schade zien. Tik op een foto om hem te verwijderen.</span>}
        </div>

        <div className="field">
          <label htmlFor="title">Wat verkoop je?</label>
          <input id="title" name="title" className="input" placeholder="Bijvoorbeeld: wollen mantel, camel" maxLength={60} required />
          {fieldError("title")}
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor="brand">Merk</label>
            <input id="brand" name="brand" className="input" placeholder="Arket" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="size">Maat</label>
            <input id="size" name="size" className="input" placeholder="M" maxLength={20} required />
            {fieldError("size")}
          </div>
        </div>

        {risky ? (
          <div className="panel stack risk" style={{ gap: 10, borderColor: "var(--warn)" }} id="proof">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <IconShield />
              <span><b>Extra foto&apos;s nodig voor dit merk</b><br /><span className="small muted">Bij dit merk komt veel namaak voor. Kopers zien deze foto&apos;s bij de advertentie.</span></span>
            </div>
            <div className="two">
              <label className="choice" htmlFor="labelInput" style={{ alignItems: "center" }}>
                {label ? <IconCheck /> : <IconCamera />}<span className="t small">{label ? "Label toegevoegd" : "Foto van het label"}</span>
              </label>
              <label className="choice" htmlFor="serialInput" style={{ alignItems: "center" }}>
                {serial ? <IconCheck /> : <IconCamera />}<span className="t small">{serial ? "Code toegevoegd" : "Serie- of datumcode"}</span>
              </label>
            </div>
            <input id="labelInput" type="file" accept="image/*" className="sr" onChange={(e) => setLabel(pick(e.target.files)[0] ?? null)} />
            <input id="serialInput" type="file" accept="image/*" className="sr" onChange={(e) => setSerial(pick(e.target.files)[0] ?? null)} />
            {fieldError("proof")}
          </div>
        ) : null}

        <div className="two">
          <div className="field">
            <label htmlFor="category">Categorie</label>
            <select id="category" name="category" className="input" defaultValue="dames">
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="condition">Staat</label>
            <select id="condition" name="condition" className="input" defaultValue="goed">
              {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="description">Beschrijving</label>
          <textarea id="description" name="description" className="input" maxLength={2000} placeholder="Hoe vaak gedragen? Eventuele schade? Materiaal?" />
          <span className="hint">Wat hier staat, is de maatstaf als er een geschil komt.</span>
        </div>

        <div className="field">
          <label htmlFor="price">Wat wil je ontvangen?</label>
          <div className="prefix"><span>€</span><input id="price" name="price" className="input num" inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          {fieldError("price")}
          <div className="calc" aria-live="polite">
            {cents && cents >= 100 ? (
              <>
                <div className="spread"><span>Jij ontvangt</span><strong>{formatEuro(cents)}</strong></div>
                <div className="spread"><span>Kopers zien</span><strong>{formatEuro(allInCents(cents))}</strong></div>
                <span className="small muted">Het verschil (6% + € 0,50) betaalt de betaling, de bescherming en echte mensen in de support.</span>
              </>
            ) : <span className="muted">Vul een bedrag in. Verkopen is gratis.</span>}
          </div>
        </div>

        <label className="toggle panel">
          <span><span className="label">Retour als het niet past</span><br /><span className="small muted">De koper betaalt dan de retour. Zonder deze optie kan dat niet.</span></span>
          <input type="checkbox" className="switch" name="returns" />
        </label>

        <label className="toggle panel">
          <span><span className="label">Ophalen mogelijk</span><br /><span className="small muted">Kopers in de buurt kunnen het ophalen.</span></span>
          <input type="checkbox" className="switch" checked={pickup} onChange={(e) => setPickup(e.target.checked)} />
        </label>
        {pickup ? (
          <div className="field">
            <label htmlFor="pickupCity">Plaats</label>
            <input id="pickupCity" name="pickupCity" className="input" placeholder="Maassluis" maxLength={60} />
            {fieldError("pickupCity")}
          </div>
        ) : null}

        {error && !["photos", "title", "size", "price", "pickupCity", "proof"].includes(error.field ?? "") ? (
          <p className="err" role="alert">{error.message}</p>
        ) : null}
        <button className="btn block" type="submit" aria-busy={Boolean(busy)}>
          {busy ? <><span className="spinner" aria-hidden /> {busy}</> : "Plaats artikel"}
        </button>
      </fieldset>
    </form>
  );
}
