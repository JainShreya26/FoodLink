import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { isAuthed } from "@/lib/auth";
import { friendlyAiError } from "@/lib/ai-errors";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Clean item name, e.g. 'Canned corn'" },
          category: {
            type: "string",
            enum: ["Protein", "Grain", "Vegetable", "Fruit", "Dairy", "Other"],
          },
          quantity: { type: "number" },
          unit: {
            type: "string",
            description: "Normalized unit: lbs, cases, cans, boxes, jars, gallons, dozen, each",
          },
          expiryDate: {
            anyOf: [{ type: "string", format: "date" }, { type: "null" }],
            description: "ISO date (YYYY-MM-DD) if stated or inferable, else null",
          },
          source: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description: "Where the food came from, e.g. 'Safeway donation', else null",
          },
        },
        required: ["name", "category", "quantity", "unit", "expiryDate", "source"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SYSTEM = (today: string) => `You extract food inventory records from arbitrary unstructured input a food bank receives: pasted emails, handwritten note photos, CSV dumps, free-form text.

Rules:
- Today's date is ${today}. Resolve relative dates ("expires next month", "Dec") to concrete ISO dates.
- Normalize quantities and units ("forty cases" → 40 cases; "approx 200lb" → 200 lbs).
- Infer the best-fit category for each item.
- Skip anything that is not a food inventory item (greetings, signatures, logistics chatter).
- If quantity is truly unknown, estimate conservatively from context; never invent items.`;

export async function POST(request: Request) {
  if (!(await isAuthed()))
    return Response.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData();
  const text = form.get("text");
  const file = form.get("file");

  const content: Anthropic.ContentBlockParam[] = [];

  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) {
      return Response.json({ error: "File too large (max 8 MB)." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.type as ImageMediaType,
          data: buf.toString("base64"),
        },
      });
    } else {
      // Treat everything else (txt, csv, md…) as text
      content.push({
        type: "text",
        text: `File "${file.name}":\n${buf.toString("utf-8")}`,
      });
    }
  }

  if (typeof text === "string" && text.trim()) {
    content.push({ type: "text", text: text.trim() });
  }

  if (content.length === 0) {
    return Response.json({ error: "Provide some text or a file." }, { status: 400 });
  }

  content.push({
    type: "text",
    text: "Extract all food inventory items from the input above.",
  });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM(today),
      output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The AI declined to process this input." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens") {
      return Response.json({ error: "Input too large — try splitting it up." }, { status: 422 });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      return Response.json({ error: "No extraction produced." }, { status: 500 });
    }
    const parsed = JSON.parse(textBlock.text) as {
      items: {
        name: string;
        category: string;
        quantity: number;
        unit: string;
        expiryDate: string | null;
        source: string | null;
      }[];
    };

    return Response.json({ items: parsed.items });
  } catch (err) {
    console.error("Ingest error:", err);
    return Response.json(
      { error: friendlyAiError(err, "Extraction failed. Please try again.") },
      { status: 500 },
    );
  }
}
