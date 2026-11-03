// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";

const router = { push: vi.fn(), replace: vi.fn() };
let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(query),
}));

import { useViewState } from "./use-view-state";

const dataset = datasetSchema.parse(raw);

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  query = "";
});

describe("useViewState", () => {
  it("a valid URL is not rewritten", () => {
    query = "region=eu&market=de&period=2026-03";
    const { result } = renderHook(() => useViewState(dataset));
    expect(result.current.state).toMatchObject({ region: "eu", market: "de", period: "2026-03" });
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("an invalid URL is normalized with replace, never push", () => {
    query = "market=zz&utm_source=x";
    renderHook(() => useViewState(dataset));
    expect(router.replace).toHaveBeenCalledWith("/", { scroll: false });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("a discrete selection pushes the canonical URL", () => {
    const { result } = renderHook(() => useViewState(dataset));
    act(() => result.current.navigate({ region: "eu" }));
    expect(router.push).toHaveBeenCalledWith("/?region=eu", { scroll: false });
  });

  it("two selections before the URL commits build on each other and nothing is lost", () => {
    query = "period=2026-03";
    const { result } = renderHook(() => useViewState(dataset));
    act(() => {
      result.current.navigate({ period: "2025-01" });
      result.current.navigate({ region: "eu" });
    });
    expect(router.push).toHaveBeenNthCalledWith(1, "/?period=2025-01", { scroll: false });
    expect(router.push).toHaveBeenNthCalledWith(2, "/?region=eu&period=2025-01", { scroll: false });
  });

  it("a double click on the same selection pushes one history entry", () => {
    const { result } = renderHook(() => useViewState(dataset));
    act(() => {
      result.current.navigate({ region: "eu" });
      result.current.navigate({ region: "eu" });
    });
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("selecting what is already selected does nothing", () => {
    query = "region=eu";
    const { result } = renderHook(() => useViewState(dataset));
    act(() => result.current.navigate({ region: "eu" }));
    expect(router.push).not.toHaveBeenCalled();
  });
});
