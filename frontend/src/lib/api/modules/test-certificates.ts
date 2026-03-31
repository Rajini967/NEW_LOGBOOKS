import api from "../client";
import { unwrapPaginated } from "../pagination";

function testCertResource(basePath: string) {
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return {
    list: async () => {
      const response = await api.get(base);
      return unwrapPaginated<Record<string, unknown>>(response.data);
    },
    get: async (id: string) => {
      const response = await api.get(`${base}${id}/`);
      return response.data;
    },
    create: async (data: unknown) => {
      const response = await api.post(base, data);
      return response.data;
    },
    approve: async (id: string, action: "approve" | "reject", remarks?: string) => {
      const response = await api.post(`${base}${id}/approve/`, {
        action,
        remarks: remarks ?? "",
      });
      return response.data;
    },
    delete: async (id: string) => {
      await api.delete(`${base}${id}/`);
    },
  };
}

export const testCertificateAPI = {
  airVelocity: testCertResource("/air-velocity-tests"),
  filterIntegrity: testCertResource("/filter-integrity-tests"),
  recovery: testCertResource("/recovery-tests"),
  differentialPressure: testCertResource("/differential-pressure-tests"),
  nvpc: testCertResource("/nvpc-tests"),
};
