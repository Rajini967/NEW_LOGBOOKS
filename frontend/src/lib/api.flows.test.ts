import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("./api/client", () => ({
  default: {
    get: mockGet,
    post: mockPost,
  },
}));

import { authAPI, chillerLogAPI, dashboardSummaryAPI, reportsAPI } from "./api";

describe("API flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls chiller approve endpoint with payload", async () => {
    mockPost.mockResolvedValue({ data: { status: "approved" } });

    await chillerLogAPI.approve("123", "approve", "ok");

    expect(mockPost).toHaveBeenCalledWith("/chiller-logs/123/approve/", {
      action: "approve",
      remarks: "ok",
    });
  });

  it("fetches dashboard summary endpoint", async () => {
    mockGet.mockResolvedValue({ data: { active_chillers_count: 1 } });

    const data = await dashboardSummaryAPI.getSummary();

    expect(mockGet).toHaveBeenCalledWith("/reports/dashboard_summary/");
    expect(data).toEqual({ active_chillers_count: 1 });
  });

  it("unwraps paginated reports list", async () => {
    mockGet.mockResolvedValue({ data: { results: [{ id: "r1" }] } });

    const rows = await reportsAPI.list({ type: "utility" });

    expect(mockGet).toHaveBeenCalledWith("/reports/", { params: { type: "utility" } });
    expect(rows).toEqual([{ id: "r1" }]);
  });

  it("refreshes access token through auth API", async () => {
    localStorage.setItem("refresh_token", "refresh-123");
    mockPost.mockResolvedValue({ data: { access: "new-token" } });

    const payload = await authAPI.refreshToken();

    expect(mockPost).toHaveBeenCalledWith("/auth/refresh/", { refresh: "refresh-123" });
    expect(localStorage.getItem("access_token")).toBe("new-token");
    expect(payload).toEqual({ access: "new-token" });
  });

  it("supports create->approve->report sequence endpoints", async () => {
    mockPost.mockResolvedValue({ data: { id: "c1", status: "approved" } });
    mockGet.mockResolvedValueOnce({ data: { id: "c1" } });

    await chillerLogAPI.create({ equipment_id: "eq-1", remarks: "ok" });
    await chillerLogAPI.approve("c1", "approve", "looks good");
    await reportsAPI.get("c1");

    expect(mockPost).toHaveBeenNthCalledWith(1, "/chiller-logs/", {
      equipment_id: "eq-1",
      remarks: "ok",
    });
    expect(mockPost).toHaveBeenNthCalledWith(2, "/chiller-logs/c1/approve/", {
      action: "approve",
      remarks: "looks good",
    });
    expect(mockGet).toHaveBeenCalledWith("/reports/c1/");
  });
});
