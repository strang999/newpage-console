// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema, type CompareType } from "@/domains/market";
import { MarketComparison, type ComparisonSelection } from "./index";

afterEach(cleanup);
const dataset = datasetSchema.parse(raw);

type Props = { period?: string; compareType?: CompareType | null; compare?: string[] };
function ui(onChange: (s: ComparisonSelection) => void, p: Props = {}) {
  return <MarketComparison dataset={dataset} period={p.period ?? "2026-05"} compareType={p.compareType ?? null} compare={p.compare ?? []} onChange={onChange} />;
}
const setup = (p: Props = {}) => {
  const onChange = vi.fn<(s: ComparisonSelection) => void>();
  const view = render(ui(onChange, p));
  return { onChange, rerender: (next: Props) => view.rerender(ui(onChange, next)) };
};
const table = () => screen.findByRole("table", { name: /Raw revenue/ });

describe("MarketComparison", () => {
  it("empty state explains what to do and offers a quick start", async () => {
    const { onChange } = setup();
    expect(screen.getByText(/Pick 2 to 4 markets/)).toBeInTheDocument();
    expect(screen.getByText("0 selected · select at least 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Compare Germany, Italy and the United Kingdom/ }));
    expect(onChange).toHaveBeenLastCalledWith({ compareType: "market", compare: ["de", "it", "gb"] });
  });

  it("shows raw values from the data next to the radar for de, it, gb at May 2026", async () => {
    setup({ compareType: "market", compare: ["de", "it", "gb"] });
    const t = await table();
    const row = (name: string) => within(t).getByRole("row", { name: new RegExp(name) });
    expect(row("Germany")).toHaveTextContent("$1,676,586");
    expect(row("Germany")).toHaveTextContent("−9.7%");
    expect(row("Germany")).toHaveTextContent("92.2%");
    expect(row("Italy")).toHaveTextContent("$940,564");
    expect(row("United Kingdom")).toHaveTextContent("$2,068,011");
    expect(row("Germany")).toHaveTextContent("8.9%"); // supplied share
    expect(screen.getByRole("columnheader", { name: "Share*" })).toBeInTheDocument();
  });

  it("every value shows its 0-100 radar position, and the scaling note states the population bounds", async () => {
    setup({ compareType: "market", compare: ["de", "it"] });
    const t = await table();
    expect(within(t).getByRole("row", { name: /Germany/ })).toHaveTextContent("position 0/100"); // lowest growth of all 13 markets
    const note = screen.getByText("How the radar is scaled").closest("details");
    if (!note) throw new Error("note missing");
    expect(note).toHaveTextContent("all 13 markets in May 2026");
    expect(note).toHaveTextContent("0 = −9.7%, 100 = +18.2%");
    expect(note).toHaveTextContent("negative growth is not clipped");
  });

  it("period changes the values (the radar follows the period picker)", async () => {
    setup({ compareType: "market", compare: ["de", "it"], period: "2026-03" });
    const t = await table();
    expect(within(t).getByRole("row", { name: /Germany/ })).toHaveTextContent("$1,211,930");
    expect(screen.getByText(/Mar 2026 · derived/)).toBeInTheDocument();
  });

  it("regions: normalised over 4 regions, no share column", async () => {
    setup({ compareType: "region", compare: ["eu", "apac"] });
    const t = await table();
    expect(within(t).getByRole("row", { name: /APAC/ })).toHaveTextContent("$9,491,556");
    expect(within(t).getByRole("row", { name: /APAC/ })).toHaveTextContent("position 100/100");
    expect(screen.queryByRole("columnheader", { name: "Share*" })).not.toBeInTheDocument();
    expect(screen.getByText(/all 4 regions/)).toBeInTheDocument();
  });

  it("a text summary names the highest and lowest compared entity per axis", async () => {
    setup({ compareType: "market", compare: ["de", "it", "gb"] });
    await table();
    expect(screen.getByText("Highest revenue: United Kingdom ($2,068,011); lowest: Italy ($940,564).")).toBeInTheDocument();
    expect(screen.getByText(/Highest year-on-year growth: United Kingdom \(\+8\.8%\); lowest: Germany \(−9\.7%\)\./)).toBeInTheDocument();
  });

  it("a half-made selection is kept locally and not wiped when the URL normalises it away", async () => {
    const { onChange, rerender } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Germany" }));
    expect(onChange).toHaveBeenLastCalledWith({ compareType: null, compare: [] }); // one is not a valid comparison
    rerender({ compareType: null, compare: [] }); // the URL still has nothing
    expect(screen.getByRole("checkbox", { name: "Germany" })).toBeChecked();
    expect(screen.getByText("1 selected · select at least 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Italy" }));
    expect(onChange).toHaveBeenLastCalledWith({ compareType: "market", compare: ["de", "it"] });
    rerender({ compareType: "market", compare: ["de", "it"] });
    expect(await table()).toBeInTheDocument();
  });

  it("unchecking down to one keeps the draft when the URL echoes the cleared state (the echo guard)", async () => {
    const { onChange, rerender } = setup({ compareType: "market", compare: ["de", "it"] });
    await userEvent.click(screen.getByRole("checkbox", { name: "Italy" }));
    expect(onChange).toHaveBeenLastCalledWith({ compareType: null, compare: [] });
    rerender({ compareType: null, compare: [] }); // the URL echoes our write: the half-made draft must survive
    expect(screen.getByRole("checkbox", { name: "Germany" })).toBeChecked();
    expect(screen.getByText("1 selected · select at least 2")).toBeInTheDocument();
  });

  it("switching type while valid keeps the new type when the URL echoes the cleared state", async () => {
    const { rerender } = setup({ compareType: "market", compare: ["de", "it"] });
    await userEvent.click(screen.getByRole("radio", { name: "Regions" }));
    rerender({ compareType: null, compare: [] });
    expect(screen.getByRole("radio", { name: "Regions" })).toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getByText("0 selected · select at least 2")).toBeInTheDocument();
  });

  it("two quick edits before any URL change arrives: neither echo overwrites the draft", async () => {
    const { rerender } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Germany" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Italy" })); // write 1: valid [de, it]
    await userEvent.click(screen.getByRole("checkbox", { name: "Italy" })); // write 2: back to one (half-made)
    rerender({ compareType: "market", compare: ["de", "it"] }); // echo of write 1 arrives late
    expect(screen.getByRole("checkbox", { name: "Germany" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Italy" })).not.toBeChecked();
    rerender({ compareType: null, compare: [] }); // echo of write 2
    expect(screen.getByRole("checkbox", { name: "Germany" })).toBeChecked();
    expect(screen.getByText("1 selected · select at least 2")).toBeInTheDocument();
  });

  it("a write that does not change the URL leaves no stale marker: a later external change is adopted", async () => {
    const { rerender } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Germany" })); // URL stays empty, so no echo is expected
    rerender({ compareType: "market", compare: ["us", "ca"] }); // an external link
    expect(screen.getByRole("checkbox", { name: "United States" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Germany" })).not.toBeChecked();
  });

  it("at 4 selected the rest are disabled (max 4), and unchecking re-enables them", async () => {
    setup({ compareType: "market", compare: ["us", "ca", "de", "gb"] });
    expect(screen.getByText(/4 selected \(maximum reached\)/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "France" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Germany" })).toBeEnabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Germany" }));
    expect(screen.getByRole("checkbox", { name: "France" })).toBeEnabled();
  });

  it("switching between markets and regions clears the selection (types are never mixed)", async () => {
    const { onChange } = setup({ compareType: "market", compare: ["de", "it"] });
    await userEvent.click(screen.getByRole("radio", { name: "Regions" }));
    expect(onChange).toHaveBeenLastCalledWith({ compareType: null, compare: [] });
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
  });

  it("back then forward to the same comparison restores it (the own-write marker does not go stale)", async () => {
    const { rerender } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Compare Germany, Italy and the United Kingdom/ }));
    rerender({ compareType: "market", compare: ["de", "it", "gb"] }); // our write reaches the URL
    expect(await table()).toBeInTheDocument();
    rerender({ compareType: null, compare: [] }); // browser back
    expect(screen.getByRole("checkbox", { name: "Germany" })).not.toBeChecked();
    expect(screen.queryByRole("table", { name: /Raw revenue/ })).not.toBeInTheDocument();
    rerender({ compareType: "market", compare: ["de", "it", "gb"] }); // browser forward
    expect(await table()).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Germany" })).toBeChecked();
  });

  it("an external URL change (back/forward, a link) replaces the draft", async () => {
    const { rerender } = setup({ compareType: "market", compare: ["de", "it"] });
    expect(screen.getByRole("checkbox", { name: "Germany" })).toBeChecked();
    rerender({ compareType: "region", compare: ["eu", "apac"] });
    expect(screen.getByRole("checkbox", { name: "Europe" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Regions" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "Compare regions" })).toBeInTheDocument();
  });
});
