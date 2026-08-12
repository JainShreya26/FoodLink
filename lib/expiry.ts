/** Parse date-only strings at UTC noon so local rendering never shifts a day. */
export function parseExpiry(value: string | null): Date | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
}
