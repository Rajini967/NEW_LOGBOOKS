import api from "../client";

/** Backend rejects when (date_to - date_from).days >= 31 — max inclusive span is 30 delta days. */
const DAILY_CONSUMPTION_CHUNK_MAX_DELTA_DAYS = 30;

function toLocalYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return toLocalYyyyMmDd(d);
}

function ymdInclusiveDaySpan(dateFrom: string, dateTo: string): number {
  const a = new Date(`${dateFrom.slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${dateTo.slice(0, 10)}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

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
    chemical_name?: string;
    type?: "chiller" | "boiler" | "chemical";
  }) => {
    const response = await api.get("/reports/daily_consumption/", {
      params: params ?? {},
    });
    return response.data;
  },
  /**
   * Same as getDailyConsumption but splits long ranges into chunks under the server's 31-day cap.
   * Use for dashboard totals (e.g. year view); keeps single request for day/month-sized ranges.
   */
  getDailyConsumptionBatched: async (params?: {
    date_from?: string;
    date_to?: string;
    equipment_id?: string;
    chemical_name?: string;
    type?: "chiller" | "boiler" | "chemical";
  }) => {
    const rawFrom = params?.date_from?.slice(0, 10);
    const rawTo = params?.date_to?.slice(0, 10);
    if (!rawFrom || !rawTo) {
      const response = await api.get("/reports/daily_consumption/", { params: params ?? {} });
      return response.data;
    }
    if (rawFrom > rawTo || ymdInclusiveDaySpan(rawFrom, rawTo) < 31) {
      const response = await api.get("/reports/daily_consumption/", {
        params: params ?? {},
      });
      return response.data;
    }

    const type = params?.type;
    const chillerMap = new Map<string, Record<string, unknown>>();
    const boilerMap = new Map<string, Record<string, unknown>>();
    const chemicalMap = new Map<string, Record<string, unknown>>();

    let chunkStart = rawFrom;
    while (chunkStart <= rawTo) {
      let chunkEnd = addCalendarDaysYmd(chunkStart, DAILY_CONSUMPTION_CHUNK_MAX_DELTA_DAYS);
      if (chunkEnd > rawTo) chunkEnd = rawTo;
      const response = await api.get("/reports/daily_consumption/", {
        params: { ...params, date_from: chunkStart, date_to: chunkEnd },
      });
      const data = response.data ?? {};

      if (!type || type === "chiller") {
        for (const row of Array.isArray(data.chiller) ? data.chiller : []) {
          const r = row as Record<string, unknown>;
          chillerMap.set(`${r.equipment_id}|${r.date}`, r);
        }
      }
      if (!type || type === "boiler") {
        for (const row of Array.isArray(data.boiler) ? data.boiler : []) {
          const r = row as Record<string, unknown>;
          boilerMap.set(`${r.equipment_id}|${r.date}`, r);
        }
      }
      if (!type || type === "chemical") {
        for (const row of Array.isArray(data.chemical) ? data.chemical : []) {
          const r = row as Record<string, unknown>;
          chemicalMap.set(
            `${r.equipment_name ?? r.equipment_id}|${r.chemical_name}|${r.date}`,
            r,
          );
        }
      }

      chunkStart = addCalendarDaysYmd(chunkEnd, 1);
    }

    const sortChillerBoiler = (a: Record<string, unknown>, b: Record<string, unknown>) => {
      const ea = String(a.equipment_id ?? "");
      const eb = String(b.equipment_id ?? "");
      if (ea !== eb) return ea.localeCompare(eb);
      return String(a.date ?? "").localeCompare(String(b.date ?? ""));
    };

    const out: Record<string, unknown> = {};
    if (!type || type === "chiller") {
      out.chiller = Array.from(chillerMap.values()).sort(sortChillerBoiler);
    }
    if (!type || type === "boiler") {
      out.boiler = Array.from(boilerMap.values()).sort(sortChillerBoiler);
    }
    if (!type || type === "chemical") {
      out.chemical = Array.from(chemicalMap.values());
    }
    return out;
  },
  saveDailyConsumption: async (payload: {
    type: "chiller" | "boiler" | "chemical";
    date: string;
    equipment_id?: string;
    chemical_name?: string;
    power_kwh?: number;
    water_ct1_l?: number;
    water_ct2_l?: number;
    water_ct3_l?: number;
    water_l?: number;
    chemical_kg?: number;
    quantity_kg?: number;
    price_rs?: number;
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
