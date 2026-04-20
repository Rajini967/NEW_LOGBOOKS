import api from "../client";
import type { MissingSlotsRangeResponse, MissingSlotsResponse } from "../types";

function unwrapPaginated<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown[] }).results)) {
    return ((payload as { results?: T[] }).results) ?? [];
  }
  return [];
}

type FilterLogRecord = {
  id?: string;
  equipment_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export const filterLogAPI = {
  list: async (
    params?: { date_from?: string; date_to?: string; equipment_id?: string; status?: string },
  ): Promise<FilterLogRecord[]> => {
    const response = await api.get("/filter-logs/", { params });
    return unwrapPaginated<FilterLogRecord>(response.data);
  },
  missingSlots: async (params?: {
    date?: string;
    date_from?: string;
    date_to?: string;
    equipment_id?: string;
  }): Promise<MissingSlotsResponse | MissingSlotsRangeResponse> => {
    const response = await api.get<MissingSlotsResponse | MissingSlotsRangeResponse>(
      "/filter-logs/missing-slots/",
      { params },
    );
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/filter-logs/${id}/`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post("/filter-logs/", data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/filter-logs/${id}/`, data);
    return response.data;
  },
  patch: async (id: string, data: any) => {
    const response = await api.patch(`/filter-logs/${id}/`, data);
    return response.data;
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/filter-logs/${id}/approve/`, { action, remarks });
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/filter-logs/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/filter-logs/${id}/correct/`, data);
    return response.data;
  },
};

export const filtersDashboardAPI = {
  getSummary: async (params: {
    periodType: "week" | "month";
    date: string;
    equipmentId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const response = await api.get("/filter-schedules/dashboard_summary/", {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentId ? { equipment_id: params.equipmentId } : {}),
        ...(params.dateFrom && params.dateTo ? { date_from: params.dateFrom, date_to: params.dateTo } : {}),
      },
    });
    return response.data;
  },
};
