"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadEvidence } from "@/lib/evidence";
import { IconCamera } from "@/components/icons";

export function EvidenceAdder({ disputeId, userId }: { disputeId: string; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    try {
      await uploadEvidence(disputeId, userId, [...files], (d, t) => setBusy(`Uploaden (${d} van ${t})`));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="field">
      <label className="btn secondary block" htmlFor="addEvidence" aria-busy={Boolean(busy)}>
        {busy ? <><span className="spinner" aria-hidden /> {busy}</> : <><IconCamera /> Foto of video toevoegen</>}
      </label>
      <input id="addEvidence" type="file" accept="image/*,video/*" multiple className="sr" disabled={Boolean(busy)} onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
      {error ? <span className="err" role="alert">{error}</span> : null}
    </div>
  );
}
