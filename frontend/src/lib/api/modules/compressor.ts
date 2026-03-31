import api from "../client";
import { unwrapPaginated } from "../pagination";

export const compressorLogAPI = {
  list: async (params?: { date_from?: string; date_to?: string; equipment_id?: string }) => {
    const response = await api.get("/compressor-logs/", { params });
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  get: async (id: string) => {
    const response = await api.get(`/compressor-logs/${id}/`);
    return response.data;
  },
  create: async (data: unknown) => {
    const response = await api.post("/compressor-logs/", data);
    return response.data;
  },
  update: async (id: string, data: unknown) => {
    const response = await api.put(`/compressor-logs/${id}/`, data);
    return response.data;
  },
  patch: async (id: string, data: unknown) => {
    const response = await api.patch(`/compressor-logs/${id}/`, data);
    return response.data;
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/compressor-logs/${id}/approve/`, { action, remarks });
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/compressor-logs/${id}/`);
  },
  correct: async (id: string, data: unknown) => {
    const response = await api.post(`/compressor-logs/${id}/correct/`, data);
    return response.data;
  },
};
