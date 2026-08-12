import Anthropic from "@anthropic-ai/sdk";

/**
 * Turns a provider error into something a food bank manager can act on.
 * The raw JSON still goes to the server log; only this sentence reaches the UI.
 */
export function friendlyAiError(err: unknown, fallback: string): string {
  if (!(err instanceof Anthropic.APIError)) return fallback;

  const detail =
    typeof err.error === "object" &&
    err.error !== null &&
    "error" in err.error &&
    typeof (err.error as { error?: { message?: string } }).error?.message === "string"
      ? (err.error as { error: { message: string } }).error.message
      : "";

  if (/credit balance/i.test(detail)) {
    return "The AI service is out of credit. Add credit to the Anthropic account, then try again.";
  }
  if (err.status === 401 || /api key/i.test(detail)) {
    return "The AI service rejected our API key. Check ANTHROPIC_API_KEY in the server environment.";
  }
  if (err.status === 429) {
    return "The AI service is rate-limited right now. Wait a moment and try again.";
  }
  if (err.status === 529 || (err.status ?? 0) >= 500) {
    return "The AI service is temporarily unavailable. Try again in a minute.";
  }
  return fallback;
}
