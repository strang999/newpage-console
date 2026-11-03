import { z } from "zod";

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must be YYYY-MM");
const money = z.number().finite().nonnegative();

export const statusSchema = z.enum(["on_track", "at_risk", "off_track"]);
export type MarketStatus = z.infer<typeof statusSchema>;

const regionSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });
const productSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });

const marketSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  iso3: z.string().length(3),
  iso2: z.string().length(2),
  regionId: z.string().min(1),
  /** Supplied latest-period snapshot. Share and status exist only here, never per period. */
  kpis: z.object({
    revenue: money,
    growthPct: z.number().finite(),
    sharePct: z.number().finite(),
    forecastAttainmentPct: z.number().finite(),
    status: statusSchema,
    anomalies: z.array(z.object({ period: periodSchema, type: z.string(), note: z.string() })),
  }),
});

const factSchema = z.object({
  marketId: z.string().min(1),
  productId: z.string().min(1),
  period: periodSchema,
  actual: money,
  forecast: money,
  units: money,
  priorYear: money,
});

export const datasetSchema = z
  .object({
    meta: z.object({
      currency: z.literal("USD"),
      periods: z.array(periodSchema).min(1),
      latestPeriod: periodSchema,
      generatedAt: z.string(),
    }),
    regions: z.array(regionSchema).min(1),
    products: z.array(productSchema).min(1),
    markets: z.array(marketSchema).min(1),
    series: z.array(factSchema).min(1),
  })
  .superRefine((d, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    const regions = new Set(d.regions.map((r) => r.id));
    const markets = new Set(d.markets.map((m) => m.id));
    const products = new Set(d.products.map((p) => p.id));
    const periods = new Set(d.meta.periods);
    if (!periods.has(d.meta.latestPeriod)) issue(`latestPeriod ${d.meta.latestPeriod} is not in periods`);
    for (const m of d.markets) if (!regions.has(m.regionId)) issue(`market ${m.id} references unknown region ${m.regionId}`);
    const seen = new Set<string>();
    for (const f of d.series) {
      if (!markets.has(f.marketId)) issue(`fact references unknown market ${f.marketId}`);
      if (!products.has(f.productId)) issue(`fact references unknown product ${f.productId}`);
      if (!periods.has(f.period)) issue(`fact references period ${f.period} outside meta.periods`);
      const key = `${f.marketId}|${f.productId}|${f.period}`;
      if (seen.has(key)) issue(`duplicate fact ${key}`);
      seen.add(key);
    }
    const expected = markets.size * products.size * periods.size;
    if (seen.size !== expected) issue(`expected ${expected} facts (markets x products x periods), found ${seen.size}`);
  });

export type Dataset = z.infer<typeof datasetSchema>;
export type Market = Dataset["markets"][number];
export type Region = Dataset["regions"][number];
export type Product = Dataset["products"][number];
export type Fact = Dataset["series"][number];
