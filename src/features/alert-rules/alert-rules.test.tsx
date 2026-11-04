// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { AlertRules } from "./index";
import { alertRepository } from "./model/repository";

const dataset = datasetSchema.parse(raw);
const KEY = "market-console.alert-rules.v1";

function renderRules() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AlertRules dataset={dataset} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

type Gate = { resolve: () => void };
/** A stand-in for the mock endpoint: rejects names containing "fail", otherwise echoes. `hold` keeps requests open until released. */
function stubServer(options: { hold?: boolean } = {}) {
  const gates: Gate[] = [];
  const calls: { op: string; name: string }[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { op: string; rule: { name: string } };
    calls.push({ op: body.op, name: body.rule.name });
    if (options.hold) await new Promise<void>((resolve) => gates.push({ resolve }));
    return /fail/i.test(body.rule.name) ? Response.json({ error: "The server could not save this rule (simulated failure)." }, { status: 500 }) : Response.json({ ok: true, ...body });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls, release: () => gates.splice(0).forEach((g) => g.resolve()) };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const name = () => screen.getByRole("textbox", { name: "Name" });
const threshold = () => screen.getByRole("spinbutton", { name: /Alert when below/ });
const save = () => screen.getByRole("button", { name: /Save rule|Saving/ });
const rows = () => screen.queryAllByTestId("alert-rule");

async function fill(ruleName: string, value: string, metric?: "growth" | "attainment") {
  await userEvent.clear(name());
  await userEvent.type(name(), ruleName);
  if (metric) await userEvent.click(screen.getByRole("radio", { name: metric === "growth" ? "YoY growth" : "Forecast attainment" }));
  await userEvent.clear(threshold());
  await userEvent.type(threshold(), value);
}

describe("validation", () => {
  it("an empty form shows errors, focuses the first invalid field and sends nothing", async () => {
    const { fetchMock } = stubServer();
    renderRules();
    await userEvent.click(save());
    expect(await screen.findByText("Name must be at least 2 characters")).toBeInTheDocument();
    expect(screen.getByText("Enter a threshold")).toBeInTheDocument();
    expect(name()).toHaveFocus();
    expect(name()).toHaveAttribute("aria-invalid", "true");
    expect(name()).toHaveAccessibleDescription(/Name must be at least 2 characters/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an empty threshold is an error, not 0", async () => {
    const { fetchMock } = stubServer();
    renderRules();
    await userEvent.type(name(), "Europe watch");
    await userEvent.click(save());
    expect(await screen.findByText("Enter a threshold")).toBeInTheDocument();
    expect(threshold()).toHaveValue(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an out-of-bounds threshold states the explicit bounds for the chosen metric", async () => {
    stubServer();
    renderRules();
    await fill("Too high", "200");
    await userEvent.click(save());
    expect(await screen.findByText("Attainment threshold must be between 50% and 150%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "YoY growth" }));
    await userEvent.clear(threshold());
    await userEvent.type(threshold(), "-80");
    await userEvent.click(save());
    expect(await screen.findByText("Growth threshold must be between -50% and 100%")).toBeInTheDocument();
  });

  it("'Selected markets' reveals the market list and requires at least one", async () => {
    const { fetchMock } = stubServer();
    renderRules();
    expect(screen.queryByRole("checkbox", { name: "Germany" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Selected markets" }));
    expect(screen.getAllByRole("checkbox").filter((c) => c.getAttribute("value"))).toHaveLength(13);
    await fill("Selected", "95");
    await userEvent.click(save());
    expect(await screen.findByText("Select at least one market")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("affected-market preview (latest period)", () => {
  it("attainment below 95% would flag Germany, Italy and the United Kingdom", async () => {
    stubServer();
    renderRules();
    const preview = screen.getByTestId("alert-preview");
    expect(preview).toHaveTextContent("Complete the rule");
    await fill("Watch", "95");
    expect(preview).toHaveTextContent("Would flag 3 of 13 markets");
    for (const m of ["Germany: 92.2%", "Italy: 93.8%", "United Kingdom: 94.6%"]) expect(preview).toHaveTextContent(m);
  });

  it("follows the metric and the scope", async () => {
    stubServer();
    renderRules();
    await fill("Growth watch", "0", "growth");
    const preview = screen.getByTestId("alert-preview");
    expect(preview).toHaveTextContent("Would flag 2 of 13 markets");
    expect(preview).toHaveTextContent("Germany: −9.7%");
    expect(preview).toHaveTextContent("Spain: −4.6%");
    await userEvent.click(screen.getByRole("radio", { name: "Selected markets" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Germany" }));
    expect(preview).toHaveTextContent("Would flag 1 of 1 market");
  });
});

describe("optimistic save", () => {
  it("shows the rule at once as pending, commits to storage only after the server confirms, then resets the form", async () => {
    const server = stubServer({ hold: true });
    renderRules();
    await fill("Europe watch", "95");
    await userEvent.click(save());

    // optimistic: visible immediately, not yet stored, save blocked against a double submit
    expect(await screen.findByText("Europe watch", { selector: "p" })).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute("data-pending", "true");
    expect(within(rows()[0] as HTMLElement).getByText("Saving…")).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(save()).toHaveAttribute("aria-disabled", "true");
    expect(server.calls).toEqual([{ op: "create", name: "Europe watch" }]);

    server.release();
    await waitFor(() => expect(rows()[0]).not.toHaveAttribute("data-pending"));
    expect(alertRepository.load().map((r) => r.name)).toEqual(["Europe watch"]);
    expect(name()).toHaveValue(""); // confirmed: the form is reset
    expect(save()).toHaveAttribute("aria-disabled", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("the badge says the rules live in this browser only", () => {
    stubServer();
    renderRules();
    expect(screen.getByTestId("persistence-badge")).toHaveTextContent("Saved in this browser only");
  });
});

describe("deterministic failure and rollback", () => {
  it("a rule named 'fail rule' appears, then rolls back; the draft is intact and storage unchanged", async () => {
    const server = stubServer({ hold: true });
    renderRules();
    await fill("fail rule", "95");
    await userEvent.click(save());

    expect(await screen.findByText("fail rule", { selector: "p" })).toBeInTheDocument(); // it showed up optimistically
    expect(rows()).toHaveLength(1);

    server.release();
    await waitFor(() => expect(rows()).toHaveLength(0)); // rolled back
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save “fail rule”");
    expect(alert).toHaveTextContent("simulated failure");
    expect(alert).toHaveTextContent("Your draft is kept");
    expect(name()).toHaveValue("fail rule"); // draft intact
    expect(threshold()).toHaveValue(95);
    expect(window.localStorage.getItem(KEY)).toBeNull(); // nothing committed
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("Retry re-sends the same rule; if the cause is gone it succeeds and the alert clears", async () => {
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        attempt += 1;
        const body = JSON.parse(String(init?.body)) as object;
        return attempt === 1 ? Response.json({ error: "Temporary problem." }, { status: 503 }) : Response.json({ ok: true, ...body });
      }),
    );
    renderRules();
    await fill("Europe watch", "95");
    await userEvent.click(save());
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() => expect(alertRepository.load().map((r) => r.name)).toEqual(["Europe watch"]));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).not.toHaveAttribute("data-pending");
  });

  it("Dismiss clears the error and keeps the draft", async () => {
    stubServer();
    renderRules();
    await fill("fail", "95");
    await userEvent.click(save());
    await userEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(name()).toHaveValue("fail");
  });

  it("a network error rolls back as well", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    renderRules();
    await fill("Europe watch", "95");
    await userEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
    expect(rows()).toHaveLength(0);
    expect(name()).toHaveValue("Europe watch");
  });

  it("if the server accepts but the browser cannot store it, the save is rolled back with that reason", async () => {
    stubServer();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    renderRules();
    await fill("Europe watch", "95");
    await userEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be stored in this browser");
    expect(rows()).toHaveLength(0);
    expect(name()).toHaveValue("Europe watch");
  });
});

describe("rule list: toggle, delete, persistence", () => {
  const seed = (...names: string[]) =>
    names.forEach((n, i) => alertRepository.commit({ op: "create", rule: { id: `r${i}`, createdAt: "2026-11-04T00:00:00.000Z", name: n, scope: "all", marketIds: [], metric: "attainment", threshold: 95, enabled: true } }));

  it("loads committed rules from this browser and describes them, with what they flag now", async () => {
    stubServer();
    seed("Europe watch");
    renderRules();
    expect(await screen.findByText("Europe watch", { selector: "p" })).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent("Forecast attainment below 95.0% · all 13 markets");
    expect(rows()[0]).toHaveTextContent("Flags 3 in May 2026: Germany, United Kingdom, Italy");
  });

  it("toggle is optimistic and confirmed; the switch reflects state and the rule stops flagging when disabled", async () => {
    const server = stubServer({ hold: true });
    seed("Europe watch");
    renderRules();
    const toggle = await screen.findByRole("switch", { name: "Europe watch: enabled" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(screen.getByRole("switch", { name: "Europe watch: enabled" })).not.toBeChecked(); // instant
    expect(rows()[0]).toHaveAttribute("data-pending", "true");
    expect(alertRepository.load()[0]?.enabled).toBe(true); // storage still has the confirmed value
    server.release();
    await waitFor(() => expect(alertRepository.load()[0]?.enabled).toBe(false));
    expect(rows()[0]).toHaveTextContent("Disabled");
  });

  it("a failed toggle flips back and says the change was undone", async () => {
    stubServer();
    seed("failing rule");
    renderRules();
    await userEvent.click(await screen.findByRole("switch", { name: "failing rule: enabled" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't disable “failing rule”");
    expect(screen.getByRole("alert")).toHaveTextContent("The change was undone");
    expect(screen.getByRole("switch", { name: "failing rule: enabled" })).toBeChecked();
    expect(alertRepository.load()[0]?.enabled).toBe(true);
  });

  it("delete is optimistic; a failed delete brings the rule back", async () => {
    const server = stubServer({ hold: true });
    seed("failing rule", "Spain watch");
    renderRules();
    await screen.findByText("failing rule", { selector: "p" });
    await userEvent.click(screen.getByRole("button", { name: "Delete failing rule" }));
    expect(rows()).toHaveLength(1); // gone at once
    expect(rows()[0]).toHaveTextContent("Spain watch");
    expect(rows()[0]).not.toHaveTextContent("failing rule");
    server.release();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete “failing rule”");
    await waitFor(() => expect(rows()).toHaveLength(2)); // restored
    expect(alertRepository.load()).toHaveLength(2);
  });

  it("controls are disabled while a write is in flight (no overlapping writes), and re-enabled after", async () => {
    const server = stubServer({ hold: true });
    seed("Europe watch");
    renderRules();
    await userEvent.click(await screen.findByRole("switch", { name: "Europe watch: enabled" }));
    expect(screen.getByRole("switch", { name: "Europe watch: enabled" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Delete Europe watch" })).toHaveAttribute("aria-disabled", "true");
    expect(save()).toHaveAttribute("aria-disabled", "true");
    // a click on an aria-disabled control does nothing
    await userEvent.click(screen.getByRole("button", { name: "Delete Europe watch" }));
    expect(server.calls).toHaveLength(1);
    server.release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete Europe watch" })).toHaveAttribute("aria-disabled", "false"));
  });

  it("after a reload only committed rules are there: the failed one never appears", async () => {
    stubServer();
    const first = renderRules();
    await fill("fail rule", "95");
    await userEvent.click(save());
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await fill("Spain watch", "100", "growth");
    await userEvent.click(save());
    await waitFor(() => expect(alertRepository.load().map((r) => r.name)).toEqual(["Spain watch"]));
    first.unmount();
    renderRules(); // a fresh cache, like a page reload
    expect(await screen.findByText("Spain watch", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("fail rule", { selector: "p" })).not.toBeInTheDocument();
  });

  it("empty state explains where rules are stored", async () => {
    stubServer();
    renderRules();
    expect(await screen.findByText(/No rules yet/)).toHaveTextContent("saved in this browser only");
  });
});
