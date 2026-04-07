import api from "../client";

export const reportsAPI = {
  list: async (params?: { type?: string }) => {
    const response = await api.get("/reports/", { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/reports/${id}/`);
    return response.data;
  },

  listUsers: async (params?: { role?: string; is_active?: string; activity_date?: string }) => {
    const response = await api.get("/reports/users/", { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  listUserActivity: async (params?: {
    from_date?: string;
    to_date?: string;
    user?: string;
    event_type?: string;
  }) => {
    const response = await api.get("/reports/user-activity/", { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  listAuditEvents: async (params?: {
    from_date?: string;
    to_date?: string;
    user?: string;
    object_type?: string;
    object_id?: string;
    event_type?: string;
  }) => {
    const first = await api.get("/reports/audit/", { params });
    if (!first.data || !first.data.results) {
      return Array.isArray(first.data) ? first.data : [];
    }

    const allRows = Array.isArray(first.data.results) ? [...first.data.results] : [];
    let nextUrl: string | null = typeof first.data.next === "string" ? first.data.next : null;

    // Audit trail should include all pages so super-admin sees cross-role history too.
    while (nextUrl) {
      const page = await api.get(nextUrl);
      if (Array.isArray(page.data?.results)) {
        allRows.push(...page.data.results);
      }
      nextUrl = typeof page.data?.next === "string" ? page.data.next : null;
    }
    return allRows;
  },
};

export const dashboardSummaryAPI = {
  getSummary: async () => {
    const response = await api.get("/reports/dashboard_summary/");
    return response.data;
  },
  getWeeklyConsumption: async (params?: { date?: string }) => {
    const response = await api.get("/reports/weekly_consumption/", {
      params: params ? { date: params.date } : {},
    });
    return Array.isArray(response.data) ? response.data : [];
  },
  getRecentActivity: async (limit?: number) => {
    const response = await api.get("/reports/recent_activity/", {
      params: limit != null ? { limit } : {},
    });
    return Array.isArray(response.data) ? response.data : [];
  },
  getEquipmentStatus: async () => {
    const response = await api.get("/reports/equipment_status/");
    return Array.isArray(response.data) ? response.data : [];
  },
  getDailyConsumption: async (params?: {
    date_from?: string;
    date_to?: string;
    equipment_id?: string;
    type?: "chiller" | "boiler" | "chemical";
  }) => {
    const response = await api.get("/reports/daily_consumption/", {
      params: params ?? {},
    });
    return response.data;
  },
  saveDailyConsumption: async (payload: {
    type: "chiller" | "boiler" | "chemical";
    date: string;
    equipment_id?: string;
    power_kwh?: number;
    water_ct1_l?: number;
    water_ct2_l?: number;
    water_ct3_l?: number;
    water_l?: number;
    chemical_kg?: number;
    diesel_l?: number;
    furnace_oil_l?: number;
    brigade_kg?: number;
    steam_kg_hr?: number;
  }) => {
    const response = await api.post("/reports/daily_consumption/", payload);
    return response.data as Record<string, unknown> & {
      warnings?: string[];
      /** Chiller/Boiler POST: stored power × rate snapshot */
      actual_electricity_cost_rs?: number | null;
    };
  },
};
