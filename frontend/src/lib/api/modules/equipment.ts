import api from "../client";
import { unwrapPaginated } from "../pagination";

export const departmentAPI = {
  list: async () => {
    const response = await api.get("/departments/");
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  create: async (data: { name: string; [key: string]: unknown }) => {
    const response = await api.post("/departments/", data);
    return response.data;
  },
  update: async (id: string, data: { name?: string; [key: string]: unknown }) => {
    const response = await api.patch(`/departments/${id}/`, data);
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/departments/${id}/`);
  },
};

export const equipmentCategoryAPI = {
  list: async () => {
    const response = await api.get("/equipment-categories/");
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  create: async (data: Record<string, unknown>) => {
    const response = await api.post("/equipment-categories/", data);
    return response.data;
  },
  update: async (id: string, data: Record<string, unknown>) => {
    const response = await api.patch(`/equipment-categories/${id}/`, data);
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/equipment-categories/${id}/`);
  },
};

/** Walk DRF pages (default PAGE_SIZE) so callers get every equipment row, not only the first page. */
export async function fetchAllEquipmentPages(): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; ; page += 1) {
    const response = await api.get("/equipment/", { params: { page } });
    const d = response.data as
      | Record<string, unknown>[]
      | { results?: Record<string, unknown>[]; next?: string | null };
    if (Array.isArray(d)) {
      return d;
    }
    const results = d?.results ?? [];
    all.push(...results);
    if (!d?.next || results.length === 0) break;
  }
  return all;
}

export const equipmentAPI = {
  list: async (params?: Record<string, unknown>) => {
    const response = await api.get("/equipment/", { params });
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  /** Full equipment list across all pages (for interval maps, etc.). */
  listAllPages: fetchAllEquipmentPages,
  create: async (data: unknown) => {
    const response = await api.post("/equipment/", data);
    return response.data;
  },
  patch: async (id: string, data: unknown) => {
    const response = await api.patch(`/equipment/${id}/`, data);
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/equipment/${id}/`);
  },
  correct: async (id: string, data: unknown) => {
    const response = await api.post(`/equipment/${id}/correct/`, data);
    return response.data;
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/equipment/${id}/approve/`, {
      action,
      remarks: remarks ?? "",
    });
    return response.data;
  },
};
