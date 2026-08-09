/**
 * @feature marketing
 * @layer test
 *
 * Marketing landing render/gates.
 */

import { render, screen, within } from "@testing-library/react";
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
  it("renders one h1, carrying the enforcement promise", () => {
    render(<Landing />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(
      "Payroll does not move until the controls clear."
    );
  });

  it("links See how controls work to #asks", () => {
    render(<Landing />);
    const links = screen.getAllByRole("link", {
      name: /see how controls work/i,
    });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("#asks");
    }
  });

  it("shows revision control proof without calling it a finding", () => {
    render(<Landing />);
    const control = document.getElementById("control");
    expect(control).not.toBeNull();
    const proof = within(control!).getByLabelText("Control state proof");
    expect(within(proof).getByText("Approval cannot proceed.")).toBeDefined();
    expect(
      within(proof).getByText("Approval gate · revision control")
    ).toBeDefined();
    expect(
      within(proof).getByText("reviewedRevision ≠ calcRevision")
    ).toBeDefined();
    expect(proof.textContent?.toLowerCase()).not.toMatch(/\bfinding\b/);
  });

  it("exposes the asks section for the primary CTA", () => {
    const { container } = render(<Landing />);
    expect(container.querySelector("#asks")).not.toBeNull();
  });

  it("shows a labelled illustrative control-failure beat", () => {
    render(<Landing />);
    expect(document.getElementById("failure")).not.toBeNull();
    expect(
      screen.getByText("1 blocking finding prevents approval.")
    ).toBeDefined();
    expect(
      screen.getByText("Illustrative finding · not customer data")
    ).toBeDefined();
    expect(screen.getByText(/PCB_UNVERIFIED/)).toBeDefined();
  });

  it("keeps every spine target present", () => {
    const { container } = render(<Landing />);
    for (const id of [
      "control",
      "asks",
      "failure",
      "proof",
      "authority",
      "next",
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("keeps skip link bound to main content", () => {
    render(<Landing />);
    expect(
      screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")
    ).toBe("#main-content");
    expect(document.getElementById("main-content")).not.toBeNull();
  });

  it("states the PCB boundary in full", () => {
    render(<Landing />);
    expect(screen.getByText(PCB_NOTE)).toBeDefined();
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
    render(<Landing />);
    for (const gate of ["Review", "Approval", "Release"]) {
      expect(screen.getAllByText(gate).length).toBeGreaterThan(0);
    }
    expect(
      screen.getByText(/Release and Close evaluate their applicable gate/i)
    ).toBeDefined();
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

  it("closes on the heads-up enforcement promise", () => {
    render(<Landing />);
    expect(
      screen.getAllByRole("heading", {
        name: "Payroll does not move until the controls clear.",
      }).length
    ).toBeGreaterThanOrEqual(2);
  });
});
