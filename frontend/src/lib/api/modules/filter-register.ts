import api from "../client";
import { unwrapPaginated } from "../pagination";

function scheduleQueryParams(params?: Record<string, unknown>) {
  if (!params) return undefined;
  const query: Record<string, string> = {};
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    if (key === "overdue" && raw === true) {
      query.overdue = "true";
      continue;
    }
    query[key] = String(raw);
  }
  return query;
}

export const filterCategoryAPI = {
  list: async () => {
    const response = await api.get("/filter-categories/");
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  create: async (data: Record<string, unknown>) => {
    const response = await api.post("/filter-categories/", data);
    return response.data;
  },
  update: async (id: string, data: Record<string, unknown>) => {
    const response = await api.patch(`/filter-categories/${id}/`, data);
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/filter-categories/${id}/`);
  },
};

export const filterMasterAPI = {
  list: async (params?: { status?: string }) => {
    const response = await api.get("/filters/", { params });
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  get: async (id: string) => {
    const response = await api.get(`/filters/${id}/`);
    return response.data;
  },
  create: async (data: unknown) => {
    const response = await api.post("/filters/", data);
    return response.data;
  },
  approve: async (id: string) => {
    const response = await api.post(`/filters/${id}/approve/`, {});
    return response.data;
  },
  reject: async (id: string) => {
    const response = await api.post(`/filters/${id}/reject/`, {});
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/filters/${id}/`);
  },
};

export const filterAssignmentAPI = {
  list: async (params?: { equipment?: string }) => {
    const response = await api.get("/filter-assignments/", { params });
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  create: async (data: unknown) => {
    const response = await api.post("/filter-assignments/", data);
    return response.data;
  },
};

export const filterScheduleAPI = {
  list: async (params?: Record<string, unknown>) => {
    const response = await api.get("/filter-schedules/", { params: scheduleQueryParams(params) });
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  /** All approved schedules (same list endpoint; use when only approval filter is needed). */
  listAll: async (params?: Record<string, unknown>) => {
    const response = await api.get("/filter-schedules/", { params: scheduleQueryParams(params) });
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  create: async (data: unknown) => {
    const response = await api.post("/filter-schedules/", data);
    return response.data;
  },
  overdueSummary: async () => {
    const response = await api.get("/filter-schedules/overdue-summary/");
    return response.data;
  },
  approve: async (id: string, _comment?: string) => {
    const response = await api.post(`/filter-schedules/${id}/approve/`, {});
    return response.data;
  },
  reject: async (id: string, _comment?: string) => {
    const response = await api.post(`/filter-schedules/${id}/reject/`, {});
    return response.data;
  },
};
