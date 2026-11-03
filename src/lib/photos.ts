/** Openbare URL van een advertentiefoto in Supabase Storage. */
export function photoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-photos/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
