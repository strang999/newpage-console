// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModeToggle } from "./mode-toggle";

afterEach(cleanup);

describe("ModeToggle", () => {
  it("is a labelled radio group with the current audience checked", () => {
    render(<ModeToggle mode="executive" onChange={() => undefined} />);
    expect(screen.getByRole("group", { name: "Audience" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Executive" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Analyst" })).not.toBeChecked();
  });

  it("reports a change by click", async () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="executive" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Analyst" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("analyst");
  });

  it("reports a change by keyboard (a separate render, so the click above cannot satisfy it)", async () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="executive" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    screen.getByRole("radio", { name: "Executive" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("analyst");
  });
});
