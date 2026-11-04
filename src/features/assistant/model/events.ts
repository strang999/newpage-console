import { z } from "zod";

/** Citation as defined by data/starter/CONTRACT.md: pointers into data.json. Any field may be absent. */
export const citationSchema = z.object({
  marketId: z.string().optional(),
  regionId: z.string().optional(),
  productId: z.string().optional(),
  /** Not format-checked here: a malformed period must surface as an unresolved reference, not kill the stream. */
  period: z.string().optional(),
  label: z.string().optional(),
});
export type Citation = z.infer<typeof citationSchema>;

export const answerKindSchema = z.enum(["normal", "low_confidence", "abstain", "error"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);

const tokenEventSchema = z.object({ type: z.literal("token"), value: z.string() });
const doneEventSchema = z.object({
  type: z.literal("done"),
  kind: answerKindSchema,
  citations: z.array(citationSchema),
  confidence: confidenceSchema,
});
const errorEventSchema = z.object({ type: z.literal("error"), message: z.string() });

/** The one SSE event contract. Everything crossing the network boundary is validated against this. */
export const streamEventSchema = z.discriminatedUnion("type", [tokenEventSchema, doneEventSchema, errorEventSchema]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

/** Metadata that only exists once the stream has finished with a `done` event. */
export type DoneMeta = Omit<z.infer<typeof doneEventSchema>, "type">;
