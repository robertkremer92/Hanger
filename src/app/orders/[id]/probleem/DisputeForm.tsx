"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISPUTE_REASONS, type DisputeReason } from "@/lib/domain/rules";
import { uploadEvidence } from "@/lib/evidence";
import { IconCamera, IconInfo, IconLock } from "@/components/icons";
import { openDispute } from "./actions";

type Picked = { file: File; preview: string };

export function DisputeForm({ orderId, userId, allowsFitReturns, highValue }: { orderId: string; userId: string; allowsFitReturns: boolean; highValue: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fitBlocked = reason === "fit" && !allowsFitReturns;
  const needsPhoto = reason ? DISPUTE_REASONS[reason].needsPhoto : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason) return setError({ field: "reason", message: "Kies wat er mis is." });
    if (text.trim().length < 20) return setError({ field: "description", message: "Beschrijf het probleem in minstens 20 tekens." });
    if (needsPhoto && !photos.length) return setError({ field: "photos", message: "Voeg minstens één foto toe, zodat de medewerker het kan beoordelen." });

    setBusy("Melding versturen");
    const res = await openDispute({ orderId, reason, description: text });
    if (res.error || !res.id) {
      setBusy(null);
      return setError({ field: res.field, message: res.error ?? "Er ging iets mis." });
    }
    const files = [...photos.map((p) => p.file), ...(video ? [video] : [])];
    try {
      if (files.length) await uploadEvidence(res.id, userId, files, (d, t) => setBusy(`Bewijs uploaden (${d} van ${t})`));
    } catch {
      // De melding staat al. Bewijs kan op de geschilpagina opnieuw worden toegevoegd.
      router.push(`/geschil/${res.id}?upload=mislukt`);
      return;
    }
    router.push(`/geschil/${res.id}?gemeld=1`);
  }

  const err = (f: string) => (error?.field === f ? <span className="err" role="alert">{error.message}</span> : null);

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p>Vertel wat er aan de hand is. De verkoper krijgt 3 dagen om te reageren. Komen jullie er niet uit, dan beslist een medewerker.</p>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }} disabled={Boolean(busy)}>
        <legend className="label" style={{ marginBottom: 8 }}>Wat is er mis?</legend>
        {(Object.keys(DISPUTE_REASONS) as DisputeReason[]).map((k) => (
          <label key={k} className="choice">
            <input type="radio" name="reason" value={k} checked={reason === k} onChange={() => { setReason(k); setError(null); }} />
            <span><span className="t">{DISPUTE_REASONS[k].label}</span><br /><span className="d">{DISPUTE_REASONS[k].hint}</span></span>
          </label>
        ))}
        {err("reason")}
      </fieldset>

      {fitBlocked ? (
        <div className="warnbox"><IconInfo /><span>Deze verkoper biedt geen retour aan als het niet past. Tussen particulieren is dat de standaard. Je kunt de verkoper wel een bericht sturen.</span></div>
      ) : reason ? (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }} disabled={Boolean(busy)}>
          <div className="field">
            <label htmlFor="description">Beschrijf het probleem</label>
            <textarea id="description" className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={3000}
              placeholder="Bijvoorbeeld: in de voering zit een scheur van ongeveer 4 cm, die staat niet in de advertentie." />
            {err("description") ?? <span className="hint">Hoe concreter, hoe sneller we kunnen beslissen.</span>}
          </div>
          <div className="field">
            <span className="label">Foto&apos;s{needsPhoto ? "" : " (optioneel)"}</span>
            <div className="photos">
              {photos.map((p, i) => (
                <button key={p.preview} type="button" className="slot" style={{ padding: 0 }} onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label={`Foto ${i + 1} verwijderen`}>
                  <img src={p.preview} alt="" />
                </button>
              ))}
              {photos.length < 8 ? <label className="add" htmlFor="evPhotos"><IconCamera />Foto toevoegen</label> : null}
            </div>
            <input id="evPhotos" type="file" accept="image/*" multiple className="sr" onChange={(e) => {
              const add = [...(e.target.files ?? [])].map((file) => ({ file, preview: URL.createObjectURL(file) }));
              setPhotos([...photos, ...add].slice(0, 8)); e.target.value = "";
            }} />
            {err("photos") ?? <span className="hint">Maak een foto van het probleem en van het label.</span>}
          </div>
          {highValue ? (
            <div className="field">
              <span className="label">Uitpakvideo (optioneel)</span>
              <label className="choice" htmlFor="evVideo" style={{ alignItems: "center" }}>
                <IconCamera /><span><span className="t">{video ? video.name : "Video toevoegen"}</span><br /><span className="d">Bij artikelen boven € 100 telt een uitpakvideo zwaar mee.</span></span>
              </label>
              <input id="evVideo" type="file" accept="video/*" className="sr" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
            </div>
          ) : null}
          <div className="note"><IconLock /><span>Zolang dit loopt, blijft je geld vastgezet. De verkoper krijgt niets uitbetaald.</span></div>
          {error && !["reason", "description", "photos"].includes(error.field ?? "") ? <p className="err" role="alert">{error.message}</p> : null}
          <button className="btn block" type="submit" aria-busy={Boolean(busy)}>
            {busy ? <><span className="spinner" aria-hidden /> {busy}</> : "Probleem melden"}
          </button>
        </fieldset>
      ) : null}
    </form>
  );
}
