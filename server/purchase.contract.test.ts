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

  it("allocates monthly INR spend evenly across custom tags", async () => {
    const { groupByMonthAndTag } = await import("./db");
    const rows = [
      { purchaseDate: new Date("2026-08-03T00:00:00.000Z"), totalAmount: "1000.00", tags: "home, tax" },
      { purchaseDate: new Date("2026-08-14T00:00:00.000Z"), totalAmount: "600.00", tags: "home" },
      { purchaseDate: new Date("2026-07-08T00:00:00.000Z"), totalAmount: "300.00", tags: "" },
    ] as any;
    const result = groupByMonthAndTag(rows);
    expect(result).toEqual([
      { key: "2026-07", label: "Jul", total: 300, tags: { Untagged: 300 } },
      { key: "2026-08", label: "Aug", total: 1600, tags: { home: 1100, tax: 500 } },
    ]);
  });

  it("normalizes new purchases to Indian rupees while preserving filters-ready metadata", async () => {
    const { normalizePurchaseInput } = await import("./db");
    const result = normalizePurchaseInput({ merchantName: "  Vault Market  ", purchaseDate: new Date("2026-08-18T00:00:00.000Z"), totalAmount: 1299.5, currency: "USD", category: "Home", warrantyDurationMonths: 12, returnWindowDays: 7, tags: "family, tax" });
    expect(result.currency).toBe("INR");
    expect(result.merchantName).toBe("Vault Market");
    expect(result.tags).toBe("family, tax");
    expect(result.totalAmount).toBe("1299.50");
  });
