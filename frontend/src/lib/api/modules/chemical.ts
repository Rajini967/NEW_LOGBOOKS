import api from "../client";
import type { MissingSlotsRangeResponse, MissingSlotsResponse } from "../types";

function unwrapPaginated<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown[] }).results)) {
    return ((payload as { results?: T[] }).results) ?? [];
  }
  return [];
}

type ChemicalPrepRecord = Record<string, unknown>;
type ChemicalStockRecord = Record<string, unknown>;
type ChemicalAssignmentRecord = Record<string, unknown>;

export const chemicalPrepAPI = {
  list: async (
    params?: { equipment_name?: string; date_from?: string; date_to?: string },
  ): Promise<ChemicalPrepRecord[]> => {
    const response = await api.get("/chemical-preps/", { params });
    return unwrapPaginated<ChemicalPrepRecord>(response.data);
  },
  missingSlots: async (params?: {
    date?: string;
    date_from?: string;
    date_to?: string;
    equipment_name?: string;
  }): Promise<MissingSlotsResponse | MissingSlotsRangeResponse> => {
    const response = await api.get<MissingSlotsResponse | MissingSlotsRangeResponse>(
      "/chemical-preps/missing-slots/",
      { params },
    );
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/chemical-preps/${id}/`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post("/chemical-preps/", data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/chemical-preps/${id}/`, data);
    return response.data;
  },
  patch: async (id: string, data: any) => {
    const response = await api.patch(`/chemical-preps/${id}/`, data);
    return response.data;
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/chemical-preps/${id}/approve/`, { action, remarks });
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/chemical-preps/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/chemical-preps/${id}/correct/`, data);
    return response.data;
  },
};

export const chemicalMasterAPI = {
  list: async () => {
    const response = await api.get("/chemicals/");
    const data = response.data;
    if (data && (data as any).results) {
      return (data as any).results;
    }
    return Array.isArray(data) ? data : [];
  },
};

export const chemicalStockAPI = {
  list: async (params?: { chemical?: string; location?: string }): Promise<ChemicalStockRecord[]> => {
    const response = await api.get("/chemical-stock/", { params });
    return unwrapPaginated<ChemicalStockRecord>(response.data);
  },
  getAvailable: async (chemicalId: string): Promise<{
    available_qty_kg: number;
    unit: string;
    price_per_unit: number | null;
  }> => {
    const response = await api.get("/chemical-stock/available/", {
      params: { chemical: chemicalId },
    });
    return response.data;
  },
  createEntry: async (data: {
    category_id?: string;
    location?: string;
    chemical_name: string;
    chemical_formula?: string;
    stock: number;
    price?: number | null;
    site?: string | null;
  }) => {
    const response = await api.post("/chemical-stock/create_entry/", data);
    return response.data;
  },
  update: async (
    id: string,
    data: { available_qty_kg?: number; unit?: string; price_per_unit?: number | null; site?: string | null },
  ) => {
    const response = await api.patch(`/chemical-stock/${id}/`, data);
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/chemical-stock/${id}/`);
  },
};

export const chemicalAssignmentAPI = {
  list: async (): Promise<ChemicalAssignmentRecord[]> => {
    const response = await api.get("/chemical-assignments/");
    return unwrapPaginated<ChemicalAssignmentRecord>(response.data);
  },
  create: async (data: {
    chemical?: string;
    location?: string;
    chemical_name?: string;
    chemical_formula?: string;
    equipment_name: string;
    category: "major" | "minor";
  }) => {
    const response = await api.post("/chemical-assignments/", data);
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/chemical-assignments/${id}/`);
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/chemical-assignments/${id}/approve/`, { action, remarks });
    return response.data;
  },
};

export const chemicalDashboardAPI = {
  getEquipmentNames: async (): Promise<{ equipment_names: string[] }> => {
    const response = await api.get<{ equipment_names: string[] }>("/chemical-preps/equipment_names/");
    return response.data;
  },
  getSummary: async (params: { periodType: "day" | "month" | "year"; date: string; equipmentName?: string | null }) => {
    const response = await api.get("/chemical-preps/dashboard_summary/", {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentName ? { equipment_name: params.equipmentName } : {}),
      },
    });
    return response.data;
  },
  getSeries: async (params: {
    periodType: "day" | "month" | "year";
    date: string;
    equipmentName?: string | null;
    days?: number;
  }) => {
    const response = await api.get("/chemical-preps/dashboard_series/", {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentName ? { equipment_name: params.equipmentName } : {}),
        ...(params.days != null ? { days: params.days } : {}),
      },
    });
    return response.data;
  },
};
