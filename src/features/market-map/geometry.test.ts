import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema, numericIdForIso3 } from "@/domains/market";

const dataset = datasetSchema.parse(raw);

describe("iso3 -> numeric geometry id", () => {
  const topology = JSON.parse(readFileSync(new URL("./data/countries-110m.json", import.meta.url), "utf8")) as {
    objects: { countries: { geometries: { id: string; properties: { name: string } }[] } };
  };
  const geometries = topology.objects.countries.geometries;

  it("all 13 markets resolve to exactly one geometry in the shipped TopoJSON", () => {
    expect(dataset.markets).toHaveLength(13);
    for (const m of dataset.markets) {
      const id = numericIdForIso3(m.iso3);
      expect(id, m.iso3).not.toBeNull();
      expect(geometries.filter((g) => String(g.id) === id), `${m.iso3} -> ${id}`).toHaveLength(1);
    }
  });

  it("maps to the right country (sanity check on names)", () => {
    const name = (iso3: string) => geometries.find((g) => String(g.id) === numericIdForIso3(iso3))?.properties.name;
    expect(name("DEU")).toBe("Germany");
    expect(name("USA")).toBe("United States of America");
    expect(name("CHN")).toBe("China");
    expect(name("AUS")).toBe("Australia");
  });

  it("the shipped copy is byte-identical to the world-atlas package it was copied from", () => {
    const shipped = readFileSync(new URL("./data/countries-110m.json", import.meta.url));
    const original = readFileSync(new URL("../../../node_modules/world-atlas/countries-110m.json", import.meta.url));
    expect(shipped.equals(original)).toBe(true);
  });

  it("is case-insensitive and returns null for unknown codes", () => {
    expect(numericIdForIso3("deu")).toBe("276");
    expect(numericIdForIso3("XXX")).toBeNull();
  });
});

