import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Omgevingsvariabele ${name} ontbreekt. Zie .env.example.`);
  return v;
}

export const env = {
  siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecret: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  cronSecret: () => required("CRON_SECRET"),
};
