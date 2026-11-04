import "@/shared/lib/zod-config";
import { z } from "zod";

/** What the dashboard is showing when a question is asked. Sent with the question so "this market" has a meaning. */
export const viewContextSchema = z.object({
  regionId: z.string().min(1).max(40).optional(),
  marketId: z.string().min(1).max(40).optional(),
  productId: z.string().min(1).max(40).optional(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export type ViewContext = z.infer<typeof viewContextSchema>;
