type DbError = { message: string; code?: string };
type Query = PromiseLike<{ data: unknown; error: DbError | null }>;

/**
 * Typeert het resultaat van een lijstquery. Zonder gegenereerde databasetypes
 * weet supabase-js de vorm niet; de vorm volgt hier uit de select-string.
 */
export async function many<T>(query: Query): Promise<{ data: T[]; error: DbError | null }> {
  const { data, error } = await query;
  return { data: (Array.isArray(data) ? data : []) as T[], error };
}
