import api from "../client";
import type { MissingSlotsResponse } from "../types";
import { unwrapPaginated } from "../pagination";

export const briquetteLogAPI = {
  list: async (params?: { date_from?: string; date_to?: string; equipment_id?: string }) => {
    const response = await api.get("/briquette-logs/", { params });
    return unwrapPaginated<Record<string, unknown>>(response.data);
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
