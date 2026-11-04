// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { ExecutiveSummary } from "./index";

afterEach(cleanup);
const dataset = datasetSchema.parse(raw);

function setup(period = "2026-05") {
  const onSelectMarket = vi.fn();
  render(<ExecutiveSummary dataset={dataset} period={period} onSelectMarket={onSelectMarket} />);
  return { onSelectMarket };
}

describe("ExecutiveSummary", () => {
  it("top risks: five flagged markets, most severe first, with status as text and the derived figures", () => {
    setup();
    const risks = screen.getByRole("region", { name: "Top risks" });
    const items = within(risks).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByRole("button").textContent)).toEqual(["Germany", "Spain", "Italy", "United Kingdom", "Brazil"]);
    expect(items[0]).toHaveTextContent("Off track");
    expect(items[0]).toHaveTextContent("92.2% of forecast");
    expect(items[0]).toHaveTextContent("$141,058 under");
    expect(items[1]).toHaveTextContent("104.7% of forecast"); // Spain: off track although above forecast, shown as supplied
    expect(items[1]).toHaveTextContent("$34,443 over");
    expect(risks).toHaveTextContent("supplied snapshot (May 2026)");
  });

  it("top movers: ranked by absolute change with direction as text and growth beside it", () => {
    setup();
    const movers = screen.getByRole("region", { name: "Top movers" });
    const items = within(movers).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByRole("button").textContent)).toEqual(["China", "United States", "Japan", "Germany", "France"]);
    expect(items[0]).toHaveTextContent("Up +$582,487");
    expect(items[0]).toHaveTextContent("+18.2%");
    expect(items[3]).toHaveTextContent("Down \u2212$180,651");
    expect(items[3]).toHaveTextContent("\u22129.7%");
  });

  it("follows the period: attainment and gap are derived for the selected month while status stays the latest snapshot", () => {
    setup("2026-03");
    const risks = screen.getByRole("region", { name: "Top risks" });
    expect(risks).toHaveTextContent("derived for Mar 2026");
    expect(risks).toHaveTextContent("supplied snapshot (May 2026)");
    expect(within(risks).getAllByRole("listitem")[0]).toHaveTextContent("92.2% of forecast"); // Germany in Mar 2026
  });

  it("selecting a market reports it", async () => {
    const { onSelectMarket } = setup();
    await userEvent.click(within(screen.getByRole("region", { name: "Top risks" })).getByRole("button", { name: "Italy" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Top movers" })).getByRole("button", { name: "Japan" }));
    expect(onSelectMarket).toHaveBeenNthCalledWith(1, "it");
    expect(onSelectMarket).toHaveBeenNthCalledWith(2, "jp");
  });
});
