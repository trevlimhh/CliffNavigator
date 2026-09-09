// `err instanceof Error` misses Supabase's PostgrestError/AuthError objects — they carry a
// `.message` string but are plain objects, not real Error instances. Every catch block in the
// UI was silently swallowing real Supabase errors (e.g. "column ... does not exist") behind a
// generic "Something went wrong" message. Use this everywhere instead of the ad hoc check.
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Something went wrong.";
}
