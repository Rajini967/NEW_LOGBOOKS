import api from "../client";
import type { MissingSlotsResponse } from "../types";
import { unwrapPaginated } from "../pagination";

export const briquetteLogAPI = {
  list: async (params?: { date_from?: string; date_to?: string; equipment_id?: string }) => {
    const first = await api.get("/briquette-logs/", { params });
    if (!first.data || !Array.isArray(first.data.results)) {
      return unwrapPaginated<Record<string, unknown>>(first.data);
    }
    const allRows: Record<string, unknown>[] = [...first.data.results];
    let nextUrl: string | null = typeof first.data.next === "string" ? first.data.next : null;
    while (nextUrl) {
      const page = await api.get(nextUrl);
      if (Array.isArray(page.data?.results)) {
        allRows.push(...page.data.results);
      }
      nextUrl = typeof page.data?.next === "string" ? page.data.next : null;
    }
    const seen = new Set<string>();
    return allRows.filter((r) => {
      const id = String(r.id ?? "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  },
  missingSlots: async (params?: { date?: string; equipment_id?: string }) => {
    const response = await api.get<MissingSlotsResponse>("/briquette-logs/missing-slots/", { params });
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/briquette-logs/${id}/`);
    return response.data;
  },
  create: async (data: unknown) => {
    const response = await api.post("/briquette-logs/", data);
    return response.data;
  },
  update: async (id: string, data: unknown) => {
    const response = await api.put(`/briquette-logs/${id}/`, data);
    return response.data;
  },
  patch: async (id: string, data: unknown) => {
    const response = await api.patch(`/briquette-logs/${id}/`, data);
    return response.data;
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/briquette-logs/${id}/approve/`, { action, remarks });
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/briquette-logs/${id}/`);
  },
  correct: async (id: string, data: unknown) => {
    const response = await api.post(`/briquette-logs/${id}/correct/`, data);
    return response.data;
  },
  backfillReports: async () => {
    const response = await api.post("/briquette-logs/backfill-reports/", {});
    return response.data;
  },
};
