import api from "../client";

export const userAPI = {
  list: async () => {
    const response = await api.get("/users/");
    return response.data;
  },
  create: async (data: unknown) => {
    const response = await api.post("/users/", data);
    return response.data;
  },
  update: async (id: string, data: unknown) => {
    const response = await api.patch(`/users/${id}/`, data);
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/users/${id}/`);
  },
  unlock: async (id: string) => {
    const response = await api.post(`/users/${id}/unlock/`, {});
    return response.data;
  },
};
