import Anthropic from "@anthropic-ai/sdk";

// Resolves credentials from ANTHROPIC_API_KEY (.env.local) or an `ant auth login` profile.
export const anthropic = new Anthropic();

export const MODEL = "claude-opus-4-8";
