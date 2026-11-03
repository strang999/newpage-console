/**
 * One suggested question per supplied fixture. The mock matches by substring, so these are the questions it can
 * answer well; free text outside them gets the supplied low-confidence fallback. "This quarter" is kept from the
 * brief; the data ends in May 2026, which the fixtures' answers state.
 */
export const SUGGESTED_PROMPTS: readonly { id: string; text: string; note: string }[] = [
  { id: "at-risk", text: "Which markets are at risk this quarter, and why?", note: "normal, high confidence" },
  { id: "germany-dip", text: "Why did Germany's revenue dip in March 2026?", note: "normal, high confidence" },
  { id: "apac-vs-europe", text: "Compare APAC and Europe on growth and forecast attainment", note: "normal, medium confidence" },
  { id: "forecast-miss", text: "What's driving the portfolio's forecast miss?", note: "low confidence" },
  { id: "next-year", text: "What will sales look like next year?", note: "abstains: beyond the data" },
  { id: "summary-long", text: "Give me a full portfolio summary", note: "long answer" },
  { id: "error", text: "force error", note: "returns an error" },
];
