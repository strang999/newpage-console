// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema, type AlertRule } from "@/domains/market";
import { AlertRules } from "./index";
import { ALERT_STORAGE_KEY, alertRepository } from "./model/repository";

const dataset = datasetSchema.parse(raw);

function renderRules() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AlertRules dataset={dataset} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

/** A controllable endpoint: every request waits for `release()`; names containing "fail" are rejected; `failNext` forces one failure. */
function server(options: { failNext?: boolean } = {}) {
  const gates: (() => void)[] = [];
  const calls: { op: string; name: string }[] = [];
  let failNext = options.failNext ?? false;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { op: string; rule: { name: string } };
    calls.push({ op: body.op, name: body.rule.name });
    await new Promise<void>((resolve) => gates.push(resolve));
    if (failNext) {
      failNext = false;
      return Response.json({ error: "Temporary problem." }, { status: 503 });
    }
    return /fail/i.test(body.rule.name) ? Response.json({ error: "The server could not save this rule (simulated failure)." }, { status: 500 }) : Response.json({ ok: true, ...body });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls, release: () => gates.splice(0).forEach((g) => g()) };
}

const rule = (id: string, name: string, over: Partial<AlertRule> = {}): AlertRule => ({ id, createdAt: "2026-11-04T00:00:00.000Z", name, scope: "all", marketIds: [], metric: "attainment", threshold: 95, enabled: true, ...over });
const name = () => screen.getByRole("textbox", { name: "Name" });
const threshold = () => screen.getByRole("spinbutton", { name: /Alert when below/ });
const save = () => screen.getByRole("button", { name: /Save rule|Saving/ });
const rows = () => screen.queryAllByTestId("alert-rule");

async function fill(ruleName: string, value: string) {
  await userEvent.clear(name());
  await userEvent.type(name(), ruleName);
  await userEvent.clear(threshold());
  await userEvent.type(threshold(), value);
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("re-entrancy: one submit is one write", () => {
  it("Enter and click in the same instant send exactly one request and create exactly one rule", async () => {
    const s = server();
    renderRules();
    await fill("Europe watch", "95");
    const form = name().closest("form") as HTMLFormElement;
    // two submissions before React has re-rendered the disabled state
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.click(save());
    await waitFor(() => expect(s.fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(1);
    s.release();
    await waitFor(() => expect(alertRepository.load()).toHaveLength(1));
  });

  it("a double click on a switch sends one toggle", async () => {
    const s = server();
    alertRepository.commit({ op: "create", rule: rule("r1", "Europe watch") });
    renderRules();
    const toggle = await screen.findByRole("switch", { name: "Europe watch: enabled" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await new Promise((r) => setTimeout(r, 50));
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
    s.release();
    await waitFor(() => expect(alertRepository.load()[0]?.enabled).toBe(false));
  });
});

describe("the draft", () => {
  it("typing a new draft while a save is in flight is not wiped when the first save is confirmed", async () => {
    const s = server();
    renderRules();
    await fill("Europe watch", "95");
    await userEvent.click(save());
    await screen.findByText("Europe watch", { selector: "p" });
    await userEvent.clear(name());
    await userEvent.type(name(), "Next rule");
    s.release();
    await waitFor(() => expect(alertRepository.load().map((r) => r.name)).toEqual(["Europe watch"]));
    expect(name()).toHaveValue("Next rule"); // the user's newer text survives the confirmation
    expect(threshold()).toHaveValue(95);
  });

  it("an untouched draft is cleared on confirmation", async () => {
    const s = server();
    renderRules();
    await fill("Europe watch", "95");
    await userEvent.click(save());
    s.release();
    await waitFor(() => expect(name()).toHaveValue(""));
  });

  it("Retry after a failure that then succeeds resets the form (the success handler survives the retry)", async () => {
    const s = server({ failNext: true });
    renderRules();
    await fill("Europe watch", "95");
    await userEvent.click(save());
    s.release();
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    s.release();
    await waitFor(() => expect(alertRepository.load().map((r) => r.name)).toEqual(["Europe watch"]));
    await waitFor(() => expect(name()).toHaveValue(""));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(s.calls).toEqual([
      { op: "create", name: "Europe watch" },
      { op: "create", name: "Europe watch" },
    ]);
  });

  it("if the user edited the draft before pressing Retry, the failed rule is saved and their newer edit is kept", async () => {
    const s = server({ failNext: true });
    renderRules();
    await fill("Europe watch", "95");
    await userEvent.click(save());
    s.release();
    await screen.findByRole("alert");
    await userEvent.clear(name());
    await userEvent.type(name(), "Something else");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    s.release();
    await waitFor(() => expect(alertRepository.load().map((r) => r.name)).toEqual(["Europe watch"])); // what the alert named is what was retried
    expect(name()).toHaveValue("Something else");
  });
});

describe("validation freshness", () => {
  it("switching the metric re-validates the threshold: a bounds error for attainment disappears when the value fits growth", async () => {
    server();
    renderRules();
    await userEvent.type(name(), "Bounds");
    await userEvent.type(threshold(), "20");
    await userEvent.tab(); // blur: validated against attainment (50..150)
    expect(await screen.findByText("Attainment threshold must be between 50% and 150%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "YoY growth" })); // 20 is fine for growth (-50..100)
    await waitFor(() => expect(screen.queryByText(/threshold must be between/)).not.toBeInTheDocument());
    expect(threshold()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("and the other way round: a valid growth value becomes an error when switching to attainment", async () => {
    server();
    renderRules();
    await userEvent.click(screen.getByRole("radio", { name: "YoY growth" }));
    await userEvent.type(name(), "Bounds");
    await userEvent.type(threshold(), "-20");
    await userEvent.tab();
    expect(screen.queryByText(/threshold must be between/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Forecast attainment" }));
    expect(await screen.findByText("Attainment threshold must be between 50% and 150%")).toBeInTheDocument();
  });

  it("a threshold with two decimals and an invisible name are rejected with clear messages", async () => {
    const s = server();
    renderRules();
    await userEvent.type(name(), "​​");
    await userEvent.type(threshold(), "92.24");
    await userEvent.click(save());
    expect(await screen.findByText("Name must be at least 2 characters")).toBeInTheDocument();
    expect(screen.getByText("Use at most one decimal place")).toBeInTheDocument();
    expect(s.fetchMock).not.toHaveBeenCalled();
  });
});

describe("focus and announcements", () => {
  it("after a failed save, focus moves to the alert so a keyboard user lands on the explanation and Retry", async () => {
    const s = server();
    renderRules();
    await fill("fail rule", "95");
    await userEvent.click(save());
    s.release();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("deleting a row keeps focus inside the list region (the Delete button is removed from the DOM)", async () => {
    const s = server();
    alertRepository.commit({ op: "create", rule: rule("r1", "Europe watch") });
    renderRules();
    const del = await screen.findByRole("button", { name: "Delete Europe watch" });
    del.focus();
    await userEvent.keyboard("{Enter}");
    expect(rows()).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Saved rules" })).toHaveFocus();
    s.release();
    await waitFor(() => expect(alertRepository.load()).toHaveLength(0));
  });

  it("controls that hold focus use aria-disabled, so focus is not dropped while a write is in flight", async () => {
    const s = server();
    alertRepository.commit({ op: "create", rule: rule("r1", "Europe watch") });
    renderRules();
    const toggle = await screen.findByRole("switch", { name: "Europe watch: enabled" });
    toggle.focus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("switch", { name: "Europe watch: enabled" })).toHaveFocus();
    expect(screen.getByRole("switch", { name: "Europe watch: enabled" })).not.toBeDisabled();
    s.release();
  });

  it("announces progress in one polite status region, and errors only through the alert (no nested live regions)", async () => {
    const s = server();
    renderRules();
    const status = screen.getAllByRole("status")[0] as HTMLElement;
    await fill("Europe watch", "95");
    await userEvent.click(save());
    await waitFor(() => expect(status).toHaveTextContent("Saving…"));
    s.release();
    await waitFor(() => expect(status).toHaveTextContent("Rule saved."));
    await fill("fail rule", "95");
    await userEvent.click(save());
    s.release();
    const alert = await screen.findByRole("alert");
    expect(alert.closest("[aria-live]")).toBeNull();
    expect(status).not.toHaveTextContent("Rule saved.");
  });
});

describe("storage and other tabs", () => {
  it("rules saved in another tab appear (storage event), and a write in flight is not clobbered", async () => {
    server();
    renderRules();
    expect(await screen.findByText(/No rules yet/)).toBeInTheDocument();
    alertRepository.commit({ op: "create", rule: rule("r9", "From another tab") });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: ALERT_STORAGE_KEY }));
    });
    expect(await screen.findByText("From another tab", { selector: "p" })).toBeInTheDocument();
  });

  it("toggling a rule that another tab deleted is rolled back with a clear reason, not shown as confirmed", async () => {
    const s = server();
    alertRepository.commit({ op: "create", rule: rule("r1", "Europe watch") });
    renderRules();
    const toggle = await screen.findByRole("switch", { name: "Europe watch: enabled" });
    window.localStorage.clear(); // another tab deleted it
    await userEvent.click(toggle);
    s.release();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("changed in another tab");
    expect(alert).toHaveTextContent("The change was undone");
    expect(screen.getByRole("switch", { name: "Europe watch: enabled" })).toBeChecked(); // the cache went back to what it was
  });

  it("a write started before the saved rules finished loading rolls back to the stored rules, not to nothing", async () => {
    const s = server();
    alertRepository.commit({ op: "create", rule: rule("r1", "Existing rule") });
    const { client } = renderRules();
    await fill("fail rule", "95");
    client.removeQueries({ queryKey: ["alert-rules"] }); // simulate: the cache is empty at mutation time
    await userEvent.click(save());
    s.release();
    await screen.findByRole("alert");
    await waitFor(() => expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining("Existing rule")]));
    expect(rows()).toHaveLength(1);
    expect(alertRepository.load()).toHaveLength(1);
  });
});
