import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Wordmark } from "@/components/icons";
import { getSession } from "@/lib/auth";
import { sendLoginLink } from "./actions";

export const metadata: Metadata = { title: "Inloggen" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; fout?: string }> }) {
  const { next = "/", fout } = await searchParams;
  if (await getSession()) redirect(next.startsWith("/") ? next : "/");
  return (
    <main className="login">
      <div className="wordmark"><Wordmark /><span>hanger</span></div>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h1">Inloggen of account maken</h1>
        <p className="muted">Je krijgt een link per e-mail. Geen wachtwoord nodig.</p>
      </div>
      {fout === "link" ? <p className="note error">Deze inloglink is verlopen of al gebruikt. Vraag een nieuwe aan.</p> : null}
      <ActionForm action={sendLoginLink}>
        <div className="field">
          <label htmlFor="email">E-mailadres</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required />
        </div>
        <input type="hidden" name="next" value={next} />
        <SubmitButton pending="Versturen">Stuur inloglink</SubmitButton>
      </ActionForm>
    </main>
  );
}
