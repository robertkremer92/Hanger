"use client";

import { createClient } from "@/lib/supabase/browser";
import { prepareImage } from "@/lib/image";

/** Uploadt bewijs naar evidence/{dispute}/{user}/... en legt het vast in het dossier. */
export async function uploadEvidence(disputeId: string, userId: string, files: File[], onProgress?: (done: number, total: number) => void) {
  const supabase = createClient();
  let done = 0;
  for (const file of files) {
    onProgress?.(done, files.length);
    const isVideo = file.type.startsWith("video/");
    const blob = isVideo ? file : await prepareImage(file, 2000);
    const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() ?? "bin").toLowerCase();
    const path = `${disputeId}/${userId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("evidence").upload(path, blob, { contentType: blob.type || file.type });
    if (up.error) throw new Error(isVideo ? "De video kon niet worden geüpload. Video's mogen maximaal 50 MB zijn." : "Een foto kon niet worden geüpload. Probeer het opnieuw.");
    const row = await supabase.from("dispute_evidence").insert({ dispute_id: disputeId, uploaded_by: userId, path, kind: isVideo ? "video" : "photo" });
    if (row.error) throw new Error("Het bewijs kon niet aan het dossier worden toegevoegd.");
    done++;
  }
  onProgress?.(done, files.length);
}
