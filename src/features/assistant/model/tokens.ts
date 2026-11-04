/**
 * The mock endpoint streams an answer one whitespace-delimited token at a time. Client and server share this split so
 * "N tokens received" means the same on both sides, which is what makes the mock resumable (see `resumeFrom`).
 */
export const tokenize = (text: string): string[] => text.match(/\S+\s*/g) ?? [];
