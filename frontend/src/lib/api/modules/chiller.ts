import api from "../client";
import type { MissingSlotsRangeResponse, MissingSlotsResponse } from "../types";

function unwrapPaginated<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown[] }).results)) {
    return ((payload as { results?: T[] }).results) ?? [];
  }
  return [];
}

type ChillerLogRecord = {
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

export const chillerLogAPI = {
  list: async (
    params?: { date_from?: string; date_to?: string; equipment_id?: string },
  ): Promise<ChillerLogRecord[]> => {
    const response = await api.get("/chiller-logs/", { params });
    return unwrapPaginated<ChillerLogRecord>(response.data);
  },
  missingSlots: async (params?: {
    date?: string;
    date_from?: string;
    date_to?: string;
    equipment_id?: string;
  }) => {
    const response = await api.get<MissingSlotsResponse | MissingSlotsRangeResponse>(
      "/chiller-logs/missing-slots/",
      { params },
    );
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/chiller-logs/${id}/`);
    return response.data;
  },
  create: async (data: { equipment_id: string; site_id?: string; remarks?: string }) => {
    const response = await api.post("/chiller-logs/", data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/chiller-logs/${id}/`, data);
    return response.data;
  },
  patch: async (id: string, data: any) => {
    const response = await api.patch(`/chiller-logs/${id}/`, data);
    return response.data;
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/chiller-logs/${id}/approve/`, { action, remarks });
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/chiller-logs/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/chiller-logs/${id}/correct/`, data);
    return response.data;
  },
};

export const chillerLimitsAPI = {
  list: async (params?: { equipment_id?: string }) => {
    const response = await api.get("/chiller-limits/", { params });
    return unwrapPaginated<DashboardMetric>(response.data);
  },
  get: async (equipmentId: string) => {
    const response = await api.get(`/chiller-limits/${encodeURIComponent(equipmentId)}/`);
    return response.data;
  },
  create: async (data: {
    equipment_id: string;
    client_id?: string;
    effective_from?: string | null;
    daily_power_limit_kw?: number | null;
    electricity_rate_rs_per_kwh?: number | null;
    daily_water_ct1_liters?: number | null;
    daily_water_ct2_liters?: number | null;
    daily_water_ct3_liters?: number | null;
  }) => {
    const response = await api.post("/chiller-limits/", data);
    return response.data;
  },
  update: async (
    equipmentId: string,
    data: Partial<{
      client_id: string | null;
      effective_from: string | null;
      daily_power_limit_kw: number | null;
      electricity_rate_rs_per_kwh: number | null;
      daily_water_ct1_liters: number | null;
      daily_water_ct2_liters: number | null;
      daily_water_ct3_liters: number | null;
    }>,
  ) => {
    const response = await api.patch(`/chiller-limits/${encodeURIComponent(equipmentId)}/`, data);
    return response.data;
  },
};

export const chillerDashboardAPI = {
  getSummary: async (params: { periodType: "day" | "month" | "year"; date: string; equipmentId?: string | null }) => {
    const response = await api.get("/chiller-logs/dashboard_summary/", {
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
    const response = await api.get("/chiller-logs/dashboard_series/", {
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
