import { describe, expect, it } from "vitest";
import { getRouterDiagnostics } from "./routers";

describe("receipt and deadline contracts", () => {
  const diagnostics = getRouterDiagnostics();

  it("keeps all six required AI extraction fields in the contract", () => {
    expect(diagnostics.extraction.fields).toEqual([
      "merchantName",
      "purchaseDate",
      "lineItems",
      "totalAmount",
      "warrantyDurationMonths",
      "returnWindowDays",
    ]);
  });

  it("uses the exact three deadline statuses and 7/1 reminder thresholds", () => {
    expect(diagnostics.extraction.statuses).toEqual(["active", "expiring soon", "expired"]);
    expect(diagnostics.extraction.reminderDays).toEqual([7, 1]);
  });

  it("classifies deadline dates with the boundary semantics used by the UI", () => {
    const classify = diagnostics.helpers.deadlineStatus;
    expect(classify(new Date(Date.now() + 8 * 86400000)).status).toBe("active");
    expect(classify(new Date(Date.now() + 7 * 86400000)).status).toBe("expiring soon");
    expect(classify(new Date(Date.now() - 1 * 86400000)).status).toBe("expired");
  });
});
