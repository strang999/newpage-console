/** The three supplied status values. Kept apart from the schema so code that only needs the list (URL parsing) does not pull the validation library into the client bundle. */
export const STATUS_VALUES = ["on_track", "at_risk", "off_track"] as const;
