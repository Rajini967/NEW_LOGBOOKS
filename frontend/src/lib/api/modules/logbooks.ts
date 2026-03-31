import api from "../client";
import { unwrapPaginated } from "../pagination";

export const logbookAPI = {
  list: async () => {
    const response = await api.get("/logbooks/schemas/");
    return unwrapPaginated<Record<string, unknown>>(response.data);
  },
  create: async (data: unknown) => {
    const response = await api.post("/logbooks/schemas/", data);
    return response.data;
  },
};
