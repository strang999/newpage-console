// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantPanel } from "./assistant-panel";

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
