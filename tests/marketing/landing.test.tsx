import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  formatRinggit,
  LEDGER_NET_SEN,
  PCB_NOTE,
  REPORTS,
  SOURCES,
} from "@/marketing/content";
import { Landing } from "@/marketing/landing";

describe("landing page", () => {
  it("renders one h1, carrying the operator-control promise", () => {
    render(<Landing />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(
      "Payroll does not move until the controls clear."
    );
  });

  it("states the PCB boundary in full", () => {
    render(<Landing />);
    expect(screen.getByText(PCB_NOTE)).toBeDefined();
  });

  it("links See how controls work to #asks", () => {
    render(<Landing />);
    const link = screen.getByRole("link", { name: /see how controls work/i });
    expect(link.getAttribute("href")).toBe("#asks");
  });

  it("shows revision control proof without calling it a finding", () => {
    render(<Landing />);
    expect(screen.getByText("Approval cannot proceed.")).toBeDefined();
    expect(
      screen.getByText("Approval gate · revision control")
    ).toBeDefined();
    expect(screen.getByText("reviewedRevision ≠ calcRevision")).toBeDefined();
    expect(screen.queryByText(/1 finding prevents approval/i)).toBeNull();
  });

  it("shows the three supported decision controls", () => {
    render(<Landing />);
    for (const label of [
      "Find the blocker",
      "Protect the decision",
      "Control the release",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("declares the illustrative employee's participation", () => {
    render(<Landing />);
    expect(screen.getByText("LINDUNG 24 JAM")).toBeDefined();
    expect(screen.getAllByText(/Opted in/i).length).toBeGreaterThan(0);
  });

  it("shows the reconciled net pay", () => {
    render(<Landing />);
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatRinggit(LEDGER_NET_SEN)
      )
    ).toBeDefined();
  });

  it("prints the reconciliation so the page can be checked against itself", () => {
    render(<Landing />);
    expect(screen.getByText(/[=] 538,620 sen/)).toBeDefined();
  });

  it("lists every cited instrument", () => {
    render(<Landing />);
    for (const source of SOURCES) {
      expect(screen.getByRole("rowheader", { name: source.ref })).toBeDefined();
    }
  });

  it("keeps supporting authority evidence in native disclosures", () => {
    const { container } = render(<Landing />);
    expect(screen.getByText("Source records and evidence")).toBeDefined();
    expect(screen.getByText("Implementation statuses")).toBeDefined();
    expect(container.querySelectorAll("details")).toHaveLength(2);
    expect(container.querySelectorAll("table")).toHaveLength(2);
  });

  it("names the four gates and no invented fifth stage", () => {
    const { container } = render(<Landing />);
    for (const gate of ["Review", "Approval", "Release"]) {
      expect(screen.getAllByText(gate).length).toBeGreaterThan(0);
    }
    // Close appears in run-evidence prose, not as a standalone label.
    expect(container.textContent).toMatch(/\bClose\b/);
    expect(screen.queryByText("RELEASED")).toBeNull();
  });

  it("offers the implemented reports without claiming submission", () => {
    render(<Landing />);
    for (const report of REPORTS) {
      expect(screen.getByText(report.title)).toBeDefined();
    }
    expect(screen.queryByText(/ready for submission/i)).toBeNull();
  });

  it("labels the effective-date comparison as illustrative", () => {
    render(<Landing />);
    expect(
      screen.getByText("Illustrative effective-date comparison")
    ).toBeDefined();
  });

  it("closes on the supported operator-control promise", () => {
    render(<Landing />);
    expect(
      screen.getByRole("heading", {
        name: "Move payroll forward with the issues, revision and release conditions in view.",
      })
    ).toBeDefined();
  });

  it("exposes a skip link to main content", () => {
    render(<Landing />);
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip.getAttribute("href")).toBe("#main-content");
    expect(skip.ownerDocument.getElementById("main-content")).not.toBeNull();
  });

  it("keeps every nav target present on the page", () => {
    const { container } = render(<Landing />);
    const anchors = ["control", "proof", "authority", "evidence"];
    for (const id of anchors) {
      expect(container.ownerDocument.getElementById(id)).not.toBeNull();
    }
  });
});
