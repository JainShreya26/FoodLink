import { cookies } from "next/headers";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { anthropic, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { isAuthed } from "@/lib/auth";
import { friendlyAiError } from "@/lib/ai-errors";
import {
  CATEGORIES,
  inventoryTotals,
  listInventory,
  listInventoryArgs,
  networkListings,
  networkListingsArgs,
  totalsArgs,
} from "@/lib/inventory-queries";

const SYSTEM = (bankName: string, today: string) =>
  `You are the inventory assistant for "${bankName}", a food bank. Answer questions about their stock using the tools provided, then explain the results in plain English.

Today is ${today}. Categories are: ${CATEGORIES.join(", ")}.

Rules:
- Always ground answers in tool results. Never guess at quantities.
- Quantities in different units cannot be summed. Group by unit, or say so plainly.
- Prefer one or two well-chosen tool calls over many small ones.
- Use a compact markdown table when listing several items.
- Expiry dates on shelf-stable food are usually "best by" dates, not safety limits —
  describe them as items to move first rather than as unsafe.
- The tools only ever see ${bankName}'s own inventory, plus flags other banks have
  posted publicly to the network board. If asked for another bank's private stock,
  explain that you cannot see it.
- If a question is not about food inventory or the network board, redirect politely.`;

/**
 * Voice mode asks for a second, spoken rendering of the same answer.
 *
 * A markdown table read aloud by a screen voice is unusable — "pipe pipe
 * Canned corn pipe eighty cans". So the model writes the answer twice: once
 * for the eye, once for the ear. One call, not two.
 */
const VOICE_ADDENDUM = `
The user is speaking to you and will hear your reply read aloud by a screen voice.

After your normal written answer, add a <speak> block containing the same answer
rewritten to be heard, not read:
- Two or three short sentences, no more. Lead with the number they asked for.
- No markdown, no tables, no bullet points, no symbols — write "40 pounds", not "40 lbs".
- Round and summarise. "Nine items expire within two weeks, mostly produce" beats a list.
- If there is a natural follow-up, end by offering it in one short question.

Example: <speak>You have about 640 pounds of rice once Thursday's USDA drop lands. That is comfortably above your par level. Want me to check the other grains?</speak>`;

/** Split the spoken rendering out of the written one. Exported for testing. */
export function splitSpoken(text: string): { answer: string; spoken: string | null } {
  const match = text.match(/<speak>([\s\S]*?)<\/speak>/i);
  if (!match) return { answer: text, spoken: null };
  return {
    answer: text.replace(match[0], "").trim(),
    spoken: match[1].trim() || null,
  };
}

/** Names + args of the lookups performed, surfaced in the UI for transparency. */
type ToolCallLog = { tool: string; args: Record<string, unknown> };

export async function POST(request: Request) {
  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });

  const bankId = (await cookies()).get("bankId")?.value;
  if (!bankId) return Response.json({ error: "No food bank selected." }, { status: 401 });

  const bank = await prisma.foodBank.findUnique({ where: { id: bankId } });
  if (!bank) return Response.json({ error: "Unknown food bank." }, { status: 401 });

  const body = (await request.json()) as {
    messages?: { role: "user" | "assistant"; content: string }[];
    voice?: boolean;
  };
  if (!body.messages?.length) {
    return Response.json({ error: "No messages." }, { status: 400 });
  }

  const calls: ToolCallLog[] = [];

  /** Wraps a query so bad model arguments become a message, not a 500. */
  const tool = <S extends z.ZodType>(
    name: string,
    description: string,
    schema: S,
    run: (args: z.infer<S>) => Promise<unknown>,
  ) =>
    betaTool({
      name,
      description,
      inputSchema: z.toJSONSchema(schema) as { type: "object" } & Record<string, unknown>,
      run: async (input) => {
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments.",
            issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
          });
        }
        calls.push({ tool: name, args: parsed.data as Record<string, unknown> });
        return JSON.stringify(await run(parsed.data));
      },
    });

  const tools = [
    tool(
      "list_inventory",
      `List ${bank.name}'s inventory items, with optional filters for category, name, source and expiry.`,
      listInventoryArgs,
      (args) => listInventory(bank.id, args),
    ),
    tool(
      "inventory_totals",
      `Aggregate ${bank.name}'s inventory — summed quantity and line-item count per group.`,
      totalsArgs,
      (args) => inventoryTotals(bank.id, args),
    ),
    tool(
      "network_listings",
      "Open surplus and shortage flags posted by food banks on the shared network board, with distance from us.",
      networkListingsArgs,
      (args) => networkListings(bank.id, args),
    ),
  ];

  try {
    const runner = anthropic.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system:
        SYSTEM(bank.name, new Date().toISOString().slice(0, 10)) +
        (body.voice ? VOICE_ADDENDUM : ""),
      tools,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      max_iterations: 8,
    });

    let final: Anthropic.Beta.BetaMessage | null = null;
    for await (const message of runner) {
      final = message;
    }

    const raw =
      final?.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() ?? "";

    const { answer, spoken } = splitSpoken(raw);

    return Response.json({
      answer: answer || "I couldn't produce an answer — try rephrasing.",
      spoken,
      calls,
    });
  } catch (err) {
    console.error("Chat error:", err);
    return Response.json(
      { error: friendlyAiError(err, "Chat failed. Please try again.") },
      { status: 500 },
    );
  }
}
