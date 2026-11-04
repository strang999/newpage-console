// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { AssistantPanel as Panel } from "./assistant-panel";

const dataset = datasetSchema.parse(raw);
const AssistantPanel = ({ onOpenEvidence = () => undefined, view }: { onOpenEvidence?: Parameters<typeof Panel>[0]["onOpenEvidence"]; view?: Parameters<typeof Panel>[0]["view"] }) => (
  <Panel dataset={dataset} onOpenEvidence={onOpenEvidence} view={view} />
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const enc = new TextEncoder();
const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const done = { type: "done", kind: "normal", citations: [], confidence: "high" };

/** A fetch whose response body the test controls, so UI states can be held open and inspected. */
function stubFetch() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start: (c) => void (controller = c),
      cancel: () => undefined,
    });
    init?.signal?.addEventListener("abort", () => {
      try {
        controller.error(new DOMException("aborted", "AbortError"));
      } catch {
        /* already closed */
      }
    });
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    push: (s: string) => controller.enqueue(enc.encode(s)),
    close: () => controller.close(),
  };
}

const article = () => within(screen.getByRole("article", { name: "Assistant answer" }));

async function ask(text: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "Ask about the data" }), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("AssistantPanel", () => {
  it("offers a suggested question for every supplied fixture", () => {
    render(<AssistantPanel />);
    expect(screen.getAllByRole("button").filter((b) => b.closest("ul"))).toHaveLength(7);
  });

  it("shows connecting, then streaming with evidence pending, then complete; metadata only after done", async () => {
    const s = stubFetch();
    render(<AssistantPanel />);
    await ask("germany");
    expect(await screen.findByText("Connecting…")).toBeInTheDocument();
    expect(screen.getByText("AI-generated · not source data")).toBeInTheDocument();

    s.push(frame({ type: "token", value: "Germany fell " }));
    expect(await screen.findByText("Germany fell")).toBeInTheDocument();
    // No confidence or citations are shown before the done event, only a pending notice.
    expect(screen.queryByTestId("trust-notice")).not.toBeInTheDocument();
    expect(screen.queryByText(/Evidence \(/)).not.toBeInTheDocument();
    expect(screen.getByText("Generating… evidence pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    s.push(frame(done));
    s.close();
    expect(await article().findByText("Answer complete.")).toBeInTheDocument();
    expect(screen.queryByText("Generating… evidence pending")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("Stop keeps the partial text, marks evidence unavailable and offers a retry", async () => {
    const s = stubFetch();
    render(<AssistantPanel />);
    await ask("germany");
    s.push(frame({ type: "token", value: "Half an answer " }));
    await screen.findByText("Half an answer");
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByText(/Stopped\. Evidence is unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Half an answer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry from the beginning" })).toBeInTheDocument();
  });

  it("EOF without done is shown as incomplete, distinct from stopped", async () => {
    const s = stubFetch();
    render(<AssistantPanel />);
    await ask("germany");
    s.push(frame({ type: "token", value: "Cut off " }));
    await screen.findByText("Cut off");
    s.close();
    expect(await article().findByText(/ended before it finished/)).toBeInTheDocument();
    expect(screen.queryByText(/Stopped\./)).not.toBeInTheDocument();
  });

  it("a server error event renders an alert with a retry, and retry never appends to the old text", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        call += 1;
        const text = call === 1 ? frame({ type: "token", value: "old " }) + frame({ type: "error", message: "Backend exploded" }) : frame({ type: "token", value: "new " }) + frame(done);
        return Promise.resolve(new Response(enc.encode(text), { status: 200, headers: { "content-type": "text/event-stream" } }));
      }),
    );
    render(<AssistantPanel />);
    await ask("force error");
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend exploded");
    await userEvent.click(screen.getByRole("button", { name: "Retry from the beginning" }));
    await waitFor(() => expect(article().getByText("Answer complete.")).toBeInTheDocument());
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.queryByText("old new")).not.toBeInTheDocument();
    expect(screen.getByText(/Earlier attempt \(error\), kept separate/)).toBeInTheDocument();
  });

  it("announces only the terminal state in a polite live region, not each token", async () => {
    const s = stubFetch();
    render(<AssistantPanel />);
    await ask("germany");
    const live = screen.getByRole("status");
    s.push(frame({ type: "token", value: "a " }));
    await screen.findByText("a");
    expect(live).toHaveTextContent("");
    s.push(frame(done));
    s.close();
    await waitFor(() => expect(live).toHaveTextContent("Answer complete."));
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("does not start a second generation while one is running", async () => {
    const s = stubFetch();
    render(<AssistantPanel />);
    await ask("germany");
    await screen.findByText("Connecting…");
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
  });
});

/** A fetch that immediately returns a complete answer with the given done event. */
function stubAnswer(done: object, text = "An answer. ") {
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(enc.encode(frame({ type: "token", value: text }) + frame({ type: "done", ...done })), { status: 200, headers: { "content-type": "text/event-stream" } })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const germanyVeltrix = { marketId: "de", productId: "veltrix", period: "2026-03", label: "Veltrix in Germany, Mar 2026" };

describe("trust surface", () => {
  it.each([
    ["high", "High confidence", /confident in this answer/],
    ["medium", "Medium confidence", /moderately confident/],
    ["low", "Low confidence", /not confident/],
  ] as const)("%s confidence shows text and an explanation", async (confidence, label, explanation) => {
    stubAnswer({ kind: "normal", citations: [], confidence });
    render(<AssistantPanel />);
    await ask("germany");
    const notice = await screen.findByTestId("trust-notice");
    expect(notice).toHaveTextContent(label);
    expect(notice).toHaveTextContent(explanation);
    expect(notice).toHaveAttribute("data-confidence", confidence);
  });

  it("a low-confidence answer is labelled as uncertain, distinct from abstention", async () => {
    stubAnswer({ kind: "low_confidence", citations: [], confidence: "low" });
    render(<AssistantPanel />);
    await ask("something odd");
    expect(await screen.findByTestId("trust-notice")).toHaveTextContent(/Low confidence.*uncertain answer/);
  });

  it("an abstention says the assistant cannot answer and shows no confidence level", async () => {
    stubAnswer({ kind: "abstain", citations: [], confidence: "low" });
    render(<AssistantPanel />);
    await ask("next year");
    const notice = await screen.findByTestId("trust-notice");
    expect(notice).toHaveAttribute("data-kind", "abstain");
    expect(notice).toHaveTextContent("Can't answer from this data");
    expect(notice).not.toHaveTextContent(/confidence/i);
  });

  it("citation chips open the evidence drawer with the exact series values and provenance", async () => {
    stubAnswer({ kind: "normal", citations: [germanyVeltrix], confidence: "high" });
    render(<AssistantPanel />);
    await ask("germany");
    await userEvent.click(await screen.findByRole("button", { name: /Veltrix in Germany, Mar 2026/ }));
    const dialog = await screen.findByRole("dialog", { name: "Germany · Veltrix · Mar 2026" });
    expect(within(dialog).getByText("Source: dataset")).toBeInTheDocument();
    const table = within(dialog).getByRole("table");
    expect(within(table).getByRole("row", { name: /Actual revenue/ })).toHaveTextContent("$427,196");
    expect(within(table).getByRole("row", { name: /Forecast \$/ })).toHaveTextContent("$461,648");
    expect(within(table).getByRole("row", { name: /Prior year/ })).toHaveTextContent("$603,279");
    expect(within(dialog).getByRole("columnheader", { name: "Feb 2026" })).toBeInTheDocument();
  });

  it("a market citation shows the supplied snapshot separately, with its anomaly note", async () => {
    stubAnswer({ kind: "normal", citations: [{ marketId: "de", period: "2026-03", label: "Germany, March dip" }], confidence: "high" });
    render(<AssistantPanel />);
    await ask("germany");
    await userEvent.click(await screen.findByRole("button", { name: /Germany, March dip/ }));
    const dialog = await screen.findByRole("dialog");
    const snapshot = within(dialog).getByRole("region", { name: /Supplied snapshot, May 2026/ });
    expect(snapshot).toHaveTextContent("Off track");
    expect(snapshot).toHaveTextContent("Market share 8.9%");
    expect(snapshot).toHaveTextContent("Revenue fell 27% versus the prior month.");
  });

  it("the AI label points at the evidence once an answer cites data, and keeps 'not source data' otherwise", async () => {
    stubAnswer({ kind: "normal", citations: [{ marketId: "de", period: "2026-03", label: "Germany, March dip" }], confidence: "high" });
    const { unmount } = render(<AssistantPanel />);
    await ask("germany");
    expect(await screen.findByText("AI-generated · verify in evidence")).toBeInTheDocument();
    expect(screen.queryByText("AI-generated · not source data")).not.toBeInTheDocument();
    unmount();
    stubAnswer({ kind: "abstain", citations: [], confidence: "low" });
    render(<AssistantPanel />);
    await ask("next year");
    expect(await screen.findByText("AI-generated · not source data")).toBeInTheDocument();
  });

  it("shows what the dashboard is showing, offers questions about it, and asks in that context", async () => {
    const fetchMock = stubAnswer({ kind: "normal", citations: [{ marketId: "de", period: "2026-03" }], confidence: "high" });
    render(<AssistantPanel view={{ context: { marketId: "de", regionId: "eu", period: "2026-03" }, label: "Germany · Mar 2026" }} />);
    expect(screen.getByTestId("assistant-context")).toHaveTextContent("Asking about Germany · Mar 2026");
    expect(screen.getByRole("button", { name: /Show the data for Germany/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /What am I looking at\?/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { question: string; context: unknown };
    expect(body).toEqual({ question: "What am I looking at?", context: { marketId: "de", regionId: "eu", period: "2026-03" } });
  });

  it("Open in dashboard hands the host the exact target and closes the drawer", async () => {
    stubAnswer({ kind: "normal", citations: [germanyVeltrix], confidence: "high" });
    const onOpenEvidence = vi.fn();
    render(<AssistantPanel onOpenEvidence={onOpenEvidence} />);
    await ask("germany");
    await userEvent.click(await screen.findByRole("button", { name: /Veltrix in Germany/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Open in dashboard" }));
    expect(onOpenEvidence).toHaveBeenCalledWith({ region: "eu", market: "de", product: "veltrix", period: "2026-03" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("an unresolvable citation is shown as an unresolved reference, never silently accepted", async () => {
    stubAnswer({ kind: "normal", citations: [{ marketId: "zz", period: "2026-03", label: "Atlantis" }], confidence: "high" });
    render(<AssistantPanel />);
    await ask("germany");
    const chip = await screen.findByRole("button", { name: /Unresolved reference: Atlantis/ });
    await userEvent.click(chip);
    const dialog = await screen.findByRole("dialog", { name: "Unresolved reference" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/could not be verified.*Unknown market/);
    expect(within(dialog).queryByRole("button", { name: "Open in dashboard" })).not.toBeInTheDocument();
  });

  it("duplicate citations collapse into one chip", async () => {
    stubAnswer({ kind: "normal", citations: [germanyVeltrix, { ...germanyVeltrix }], confidence: "high" });
    render(<AssistantPanel />);
    await ask("germany");
    expect(await screen.findByText("Evidence (1)")).toBeInTheDocument();
  });

  it("a stopped answer shows no confidence and no evidence", async () => {
    const s = stubFetch();
    render(<AssistantPanel />);
    await ask("germany");
    s.push(frame({ type: "token", value: "Half " }));
    await screen.findByText("Half");
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    await screen.findByText(/Stopped\./);
    expect(screen.queryByTestId("trust-notice")).not.toBeInTheDocument();
    expect(screen.queryByText(/Evidence \(/)).not.toBeInTheDocument();
  });
});

