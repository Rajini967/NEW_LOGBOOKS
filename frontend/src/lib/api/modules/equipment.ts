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

export const equipmentAPI = {
  list: async (params?: Record<string, unknown>) => {
    const response = await api.get("/equipment/", { params });
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
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
