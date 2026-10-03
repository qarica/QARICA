// Guards organization-scoped UUID queries. Supabase-js serializes `.eq(col, null)`
// as the literal filter `col=eq.null`, which Postgres then tries to cast to the
// column's type — for a uuid column this fails with
// `invalid input syntax for type uuid: "null"` instead of the intended "no filter"
// or "IS NULL" behavior. The same failure mode applies if a null/undefined
// organization id is ever coerced to the string "null"/"undefined"/"" before
// reaching a query (e.g. via template interpolation or URL/searchParams
// round-tripping). Callers must check this BEFORE building any query — never
// rely on catching the resulting Postgres error afterward.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidOrganizationId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
