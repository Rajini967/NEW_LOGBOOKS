import api from "../client";
import type { MissingSlotsRangeResponse, MissingSlotsResponse } from "../types";

function unwrapPaginated<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown[] }).results)) {
    return ((payload as { results?: T[] }).results) ?? [];
  }
  return [];
}

type BoilerLogRecord = {
  id?: string;
  equipment_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

type DashboardMetric = {
  [key: string]: string | number | boolean | null | undefined;
};

export const boilerLogAPI = {
  list: async (
    params?: { date_from?: string; date_to?: string; equipment_id?: string },
  ): Promise<BoilerLogRecord[]> => {
    const response = await api.get("/boiler-logs/", { params });
    return unwrapPaginated<BoilerLogRecord>(response.data);
  },
  missingSlots: async (params?: {
    date?: string;
    date_from?: string;
    date_to?: string;
    equipment_id?: string;
  }) => {
    const response = await api.get<MissingSlotsResponse | MissingSlotsRangeResponse>(
      "/boiler-logs/missing-slots/",
      { params },
    );
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/boiler-logs/${id}/`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post("/boiler-logs/", data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/boiler-logs/${id}/`, data);
    return response.data;
  },
  patch: async (id: string, data: any) => {
    const response = await api.patch(`/boiler-logs/${id}/`, data);
    return response.data;
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/boiler-logs/${id}/approve/`, { action, remarks });
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/boiler-logs/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/boiler-logs/${id}/correct/`, data);
    return response.data;
  },
};

export const boilerLimitsAPI = {
  list: async (params?: { equipment_id?: string }) => {
    const response = await api.get("/boiler-limits/", { params });
    return unwrapPaginated<DashboardMetric>(response.data);
  },
  get: async (equipmentId: string) => {
    const response = await api.get(`/boiler-limits/${encodeURIComponent(equipmentId)}/`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post("/boiler-limits/", data);
    return response.data;
  },
  update: async (equipmentId: string, data: any) => {
    const response = await api.patch(`/boiler-limits/${encodeURIComponent(equipmentId)}/`, data);
    return response.data;
  },
};

export const boilerDashboardAPI = {
  getSummary: async (params: { periodType: "day" | "month" | "year"; date: string; equipmentId?: string | null }) => {
    const response = await api.get("/boiler-logs/dashboard_summary/", {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentId ? { equipment_id: params.equipmentId } : {}),
      },
    });
    return response.data;
  },
  getSeries: async (params: {
    periodType: "day" | "month" | "year";
    date: string;
    equipmentId?: string | null;
    days?: number;
  }) => {
    const response = await api.get("/boiler-logs/dashboard_series/", {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentId ? { equipment_id: params.equipmentId } : {}),
        ...(params.days != null ? { days: params.days } : {}),
      },
    });
    return response.data;
  },
};
