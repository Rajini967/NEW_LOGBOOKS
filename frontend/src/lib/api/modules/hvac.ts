import api from "../client";

export const hvacValidationAPI = {
  get: async (id: string) => {
    const response = await api.get(`/hvac-validations/${id}/`);
    return response.data;
  },
  approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
    const response = await api.post(`/hvac-validations/${id}/approve/`, {
      action,
      remarks: remarks ?? "",
    });
    return response.data;
  },
};
