import { describe, expect, it } from "vitest";
import { resolveApprovedBy, resolveRejectedBy } from "./logbookMapperUtils";

describe("logbook mapper utils", () => {
  it("prefers secondary approver when configured", () => {
    const approvedBy = resolveApprovedBy(
      "approved",
      { approvedByName: "primary", secondaryApprovedByName: "secondary" },
      true,
    );
    expect(approvedBy).toBe("secondary");
  });

  it("returns rejected by only for rejected-like statuses", () => {
    expect(resolveRejectedBy("rejected", "reviewer")).toBe("reviewer");
    expect(resolveRejectedBy("pending_secondary_approval", "reviewer")).toBe("reviewer");
    expect(resolveRejectedBy("approved", "reviewer")).toBe("");
  });
});
