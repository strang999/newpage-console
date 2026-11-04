// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { CommandPalette } from "./index";
import { buildPaletteItems, searchItems } from "./model/items";

const dataset = datasetSchema.parse(raw);
const items = buildPaletteItems(dataset);

afterEach(cleanup);

describe("palette items and search", () => {
  it("lists the portfolio, every region, every market and every product in every market", () => {
    expect(items).toHaveLength(1 + 4 + 13 + 13 * 5);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("an empty query lists the portfolio, regions and markets, never 65 product rows", () => {
    const first = searchItems(items, "");
    expect(first[0]?.kind).toBe("portfolio");
    expect(first.every((i) => i.kind !== "product")).toBe(true);
  });

  it("finds a market, a product in a market, and tolerates case and accents", () => {
    expect(searchItems(items, "germany")[0]?.selection).toEqual({ region: "eu", market: "de", product: null });
    expect(searchItems(items, "VELTRIX japan")[0]?.selection).toEqual({ region: "apac", market: "jp", product: "veltrix" });
    expect(searchItems(items, "  Fráncé ")[0]?.label).toBe("France"); // accents are folded
  });

  it("every typed word must match; a region name lists its markets", () => {
    expect(searchItems(items, "germany veltrix").map((i) => i.label)).toEqual(["Veltrix in Germany"]);
    expect(searchItems(items, "apac", 20).map((i) => i.label)).toContain("Japan");
    expect(searchItems(items, "zzzz")).toEqual([]);
  });

  it("an exact label start outranks a mention in the detail", () => {
    const labels = searchItems(items, "eu").map((i) => i.label);
    expect(labels[0]).toBe("Europe");
  });
});

describe("CommandPalette", () => {
  it("opens with Ctrl+K, filters as you type, moves with arrows, goes with Enter and closes", async () => {
    const onSelect = vi.fn();
    render(<CommandPalette dataset={dataset} onSelect={onSelect} />);
    await userEvent.keyboard("{Control>}k{/Control}");
    const box = await screen.findByRole("combobox", { name: /Search regions/ });
    expect(box).toHaveFocus();
    await userEvent.type(box, "japan");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Japan");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(box).toHaveAttribute("aria-activedescendant", options[0]?.id);
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(onSelect).toHaveBeenCalledWith({ region: "apac", market: "jp", product: null });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens from the button, wraps around with arrows, selects by click, and says when nothing matches", async () => {
    const onSelect = vi.fn();
    render(<CommandPalette dataset={dataset} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Jump to/ }));
    const box = await screen.findByRole("combobox");
    await userEvent.keyboard("{ArrowUp}");
    const options = screen.getAllByRole("option");
    expect(options.at(-1)).toHaveAttribute("aria-selected", "true"); // wrapped to the last
    await userEvent.type(box, "nothing like this");
    expect(screen.getByText(/No region, market or product matches/)).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled(); // Enter on an empty list does nothing
    await userEvent.clear(box);
    await userEvent.type(box, "veltrix germany");
    await userEvent.click(screen.getByRole("option", { name: /Veltrix in Germany/ }));
    expect(onSelect).toHaveBeenCalledWith({ region: "eu", market: "de", product: "veltrix" });
  });

  it("Ctrl+K again closes it", async () => {
    render(<CommandPalette dataset={dataset} onSelect={() => undefined} />);
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
