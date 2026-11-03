"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";

export function SubmitButton({ children, pending, className = "btn block", disabled }: { children: ReactNode; pending?: string; className?: string; disabled?: boolean }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={busy || disabled} aria-busy={busy}>
      {busy ? <><span className="spinner" aria-hidden /> {pending ?? "Bezig"}</> : children}
    </button>
  );
}

/**
 * Formulier dat een server action aanroept en de foutmelding toont.
 * De action geeft { error } terug, of redirect bij succes.
 */
export function ActionForm({
  action,
  children,
  className = "stack",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className} noValidate>
      {children}
      {state?.error ? <p className="err" role="alert">{state.error}</p> : null}
      {state?.ok ? <p className="small" role="status" style={{ color: "var(--good)" }}>{state.ok}</p> : null}
    </form>
  );
}
