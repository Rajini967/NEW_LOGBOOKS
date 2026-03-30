import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add JWT token to requests
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh/`, {
            refresh: refreshToken,
          });

          const { access } = response.data;
          localStorage.setItem('access_token', access);

          // Retry original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access}`;
          }
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Enhanced error handling
    const errorMessage = error.response?.data
      ? (typeof error.response.data === 'string'
          ? error.response.data
          : (error.response.data as any).detail || 
            (error.response.data as any).message ||
            (error.response.data as any).error ||
            JSON.stringify(error.response.data))
      : error.message || 'An unexpected error occurred';

    // Log error for debugging
    console.error('API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: errorMessage,
      url: originalRequest?.url,
    });

    // Create enhanced error object
    const enhancedError = new Error(errorMessage) as any;
    enhancedError.status = error.response?.status;
    enhancedError.statusText = error.response?.statusText;
    enhancedError.data = error.response?.data;
    enhancedError.originalError = error;

    return Promise.reject(enhancedError);
  }
);

export type MissingSlotsEquipment = {
  equipment_id: string;
  equipment_name: string;
  interval: 'hourly' | 'shift' | 'daily';
  shift_duration_hours: number;
  expected_slot_count: number;
  present_slot_count: number;
  missing_slot_count: number;
  next_due: string | null;
  last_reading_timestamp?: string | null;
  missing_slots: {
    slot_start: string;
    slot_end: string;
    label: string;
  }[];
};

export type MissingSlotsResponse = {
  date: string;
  log_type: string;
  total_expected_slots: number;
  total_present_slots: number;
  total_missing_slots: number;
  equipment_count: number;
  affected_equipment_count: number;
  equipments: MissingSlotsEquipment[];
};

// Auth API functions
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login/', { email, password });
    const { access, refresh } = response.data;
    
    // Store tokens
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    
    return response.data;
  },

  logout: async (reason?: 'auto') => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        const url = reason === 'auto' ? '/auth/logout/?reason=auto' : '/auth/logout/';
        await api.post(url, { refresh: refreshToken });
      } catch (error) {
        // Even if logout fails, clear tokens locally
        console.error('Logout error:', error);
      }
    }
    
    // Clear tokens
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },

  refreshToken: async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await api.post('/auth/refresh/', {
      refresh: refreshToken,
    });

    const { access } = response.data;
    localStorage.setItem('access_token', access);

    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/users/me/');
    return response.data;
  },

  requestPasswordReset: async (email: string) => {
    const response = await api.post('/auth/forgot-password/', { email });
    return response.data;
  },

  validatePasswordResetToken: async (token: string) => {
    const response = await api.post('/auth/validate-reset-token/', { token });
    return response.data;
  },

  resetPassword: async (payload: { token: string; new_password: string; confirm_password: string }) => {
    const response = await api.post('/auth/reset-password/', payload);
    return response.data;
  },

  changePassword: async (payload: {
    current_password: string;
    new_password: string;
    new_password_confirm: string;
  }) => {
    const response = await api.post('/auth/change-password/', payload);
    return response.data;
  },

  // Session / activity settings
  getSessionSettings: async () => {
    const response = await api.get('/settings/session/');
    return response.data;
  },

  updateSessionSettings: async (data: {
    auto_logout_minutes?: number;
    password_expiry_days?: number | null;
    log_entry_interval?: 'hourly' | 'shift' | 'daily';
    shift_duration_hours?: number;
  }) => {
    const response = await api.patch('/settings/session/', data);
    return response.data;
  },
};

// User API functions
export const userAPI = {
  list: async (params?: { page?: number; page_size?: number }) => {
    const response = await api.get('/users/', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/users/${id}/`);
    return response.data;
  },

  create: async (data: {
    email: string;
    name?: string;
    password: string;
    password_confirm: string;
    role: string;
    is_active?: boolean;
  }) => {
    const response = await api.post('/users/', data);
    return response.data;
  },

  update: async (id: string, data: {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
    is_active?: boolean;
  }) => {
    const response = await api.put(`/users/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/users/${id}/`);
    return response.data;
  },

  unlock: async (id: string) => {
    const response = await api.post(`/users/${id}/unlock/`);
    return response.data;
  },
};

// Logbook API functions
export const logbookAPI = {
  // Get all logbooks (filtered by user's role on backend)
  list: async () => {
    const response = await api.get('/logbooks/schemas/');
    // Handle paginated response
    if (response.data.results) {
      return response.data.results;
    }
    // Handle non-paginated response (array)
    return Array.isArray(response.data) ? response.data : [];
  },

  // Get single logbook
  get: async (id: string) => {
    const response = await api.get(`/logbooks/schemas/${id}/`);
    return response.data;
  },

  // Create logbook (managers only)
  create: async (data: {
    name: string;
    description?: string;
    client_id?: string;
    category: string;
    fields: any[];
    workflow?: any;
    display?: any;
    metadata?: any;
    assigned_roles?: string[];
  }) => {
    const response = await api.post('/logbooks/schemas/', data);
    return response.data;
  },

  // Update logbook (managers only)
  update: async (id: string, data: any) => {
    const response = await api.put(`/logbooks/schemas/${id}/`, data);
    return response.data;
  },

  // Delete logbook (managers only)
  delete: async (id: string) => {
    await api.delete(`/logbooks/schemas/${id}/`);
  },

  // Assign roles to logbook
  assignRoles: async (id: string, roles: string[]) => {
    const response = await api.post(`/logbooks/schemas/${id}/assign_roles/`, {
      roles
    });
    return response.data;
  },

  // Get assigned roles for a logbook
  getAssignedRoles: async (id: string) => {
    const response = await api.get(`/logbooks/schemas/${id}/assign_roles/`);
    return response.data;
  },
};

// Site API functions
export const siteAPI = {
  list: async () => {
    const response = await api.get('/sites/');
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/sites/${id}/`);
    return response.data;
  },

  create: async (data: {
    name: string;
    location: string;
    address?: string;
    client_id: string;
    is_active?: boolean;
  }) => {
    const response = await api.post('/sites/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/sites/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/sites/${id}/`);
  },
};

// Department API functions
export const departmentAPI = {
  list: async () => {
    const response = await api.get('/departments/');
    if ((response.data as any).results) {
      return (response.data as any).results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/departments/${id}/`);
    return response.data;
  },

  create: async (data: { name: string; client_id?: string; is_active?: boolean }) => {
    const response = await api.post('/departments/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/departments/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/departments/${id}/`);
  },
};

// Equipment Category API functions
export const equipmentCategoryAPI = {
  list: async () => {
    const response = await api.get('/equipment-categories/');
    if ((response.data as any).results) {
      return (response.data as any).results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/equipment-categories/${id}/`);
    return response.data;
  },

  create: async (data: { name: string; client_id?: string; is_active?: boolean }) => {
    const response = await api.post('/equipment-categories/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/equipment-categories/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/equipment-categories/${id}/`);
  },
};

// Equipment API functions
export const equipmentAPI = {
  list: async (params?: { department?: string; category?: string; status?: string }) => {
    const response = await api.get('/equipment/', { params });
    if ((response.data as any).results) {
      return (response.data as any).results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/equipment/${id}/`);
    return response.data;
  },

  create: async (data: {
    equipment_number: string;
    name: string;
    capacity?: string | null;
    department: string;
    category: string;
    site_id?: string | null;
    client_id?: string;
    is_active?: boolean;
  }) => {
    const response = await api.post('/equipment/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/equipment/${id}/`, data);
    return response.data;
  },
  patch: async (id: string, data: any) => {
    const response = await api.patch(`/equipment/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/equipment/${id}/`);
  },

  approve: async (
    id: string,
    action: "approve" | "reject",
    remarks: string,
  ) => {
    const response = await api.post(`/equipment/${id}/approve/`, {
      action,
      remarks,
    });
    return response.data;
  },
  correct: async (
    id: string,
    data: {
      equipment_number?: string;
      name?: string;
      capacity?: string | null;
      department?: string;
      category?: string;
      site_id?: string | null;
      client_id?: string;
      is_active?: boolean;
      log_entry_interval?: "hourly" | "shift" | "daily" | null;
      shift_duration_hours?: number | null;
      tolerance_minutes?: number | null;
    },
  ) => {
    const response = await api.post(`/equipment/${id}/correct/`, data);
    return response.data;
  },
};

// Filter Master API functions
export const filterCategoryAPI = {
  list: async () => {
    const response = await api.get("/filter-categories/");
    if ((response.data as any).results) {
      return (response.data as any).results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/filter-categories/${id}/`);
    return response.data;
  },

  create: async (data: {
    name: string;
    description?: string;
    client_id?: string;
    is_active?: boolean;
  }) => {
    const response = await api.post("/filter-categories/", data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/filter-categories/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/filter-categories/${id}/`);
  },
};

export const filterMasterAPI = {
  list: async (params?: { status?: string }) => {
    const response = await api.get("/filters/", { params });
    if ((response.data as any).results) {
      return (response.data as any).results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/filters/${id}/`);
    return response.data;
  },

  create: async (data: FormData) => {
    const response = await api.post("/filters/", data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  update: async (id: string, data: FormData) => {
    const response = await api.put(`/filters/${id}/`, data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  approve: async (id: string) => {
    const response = await api.post(`/filters/${id}/approve/`);
    return response.data;
  },

  reject: async (id: string) => {
    const response = await api.post(`/filters/${id}/reject/`);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/filters/${id}/`);
  },
};

export const filterAssignmentAPI = {
  list: async (params?: { equipment?: string }) => {
    const response = await api.get("/filter-assignments/", { params });
    if ((response.data as any).results) {
      return (response.data as any).results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  create: async (data: {
    filter: string;
    equipment: string;
    area_category?: string;
    tag_info?: string;
  }) => {
    const response = await api.post("/filter-assignments/", data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/filter-assignments/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/filter-assignments/${id}/`);
  },
};

export const filterScheduleAPI = {
  list: async (params?: { overdue?: boolean; equipment?: string; approval?: "pending" | "approved" }) => {
    const queryParams: any = {};
    if (params?.overdue) {
      queryParams.overdue = "true";
    }
    if (params?.equipment) {
      queryParams.equipment = params.equipment;
    }
    if (params?.approval) {
      queryParams.approval = params.approval;
    }
    const response = await api.get("/filter-schedules/", {
      params: queryParams,
    });
    if ((response.data as any).results) {
      return (response.data as any).results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  /** All pages (default API page size is 20). Use when building lists keyed by schedule approval. */
  listAll: async (params?: {
    overdue?: boolean;
    equipment?: string;
    approval?: "pending" | "approved";
  }) => {
    const queryParams: Record<string, string> = {};
    if (params?.overdue) queryParams.overdue = "true";
    if (params?.equipment) queryParams.equipment = params.equipment;
    if (params?.approval) queryParams.approval = params.approval;
    const all: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const response = await api.get("/filter-schedules/", {
        params: { ...queryParams, page },
      });
      const data = response.data as { results?: any[]; next?: string | null };
      const batch = Array.isArray(data.results) ? data.results : [];
      all.push(...batch);
      if (!data.next || batch.length === 0) break;
    }
    return all;
  },

  create: async (data: {
    assignment: string;
    schedule_type: "replacement" | "cleaning" | "integrity";
    frequency_days?: number;
    next_due_date?: string;
    last_done_date?: string | null;
  }) => {
    const response = await api.post("/filter-schedules/", data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/filter-schedules/${id}/`, data);
    return response.data;
  },

  approve: async (id: string, remarks?: string) => {
    const response = await api.post(`/filter-schedules/${id}/approve/`, {
      remarks,
    });
    return response.data;
  },

  reject: async (id: string, remarks?: string) => {
    const response = await api.post(`/filter-schedules/${id}/reject/`, {
      remarks,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/filter-schedules/${id}/`);
  },

  overdueSummary: async () => {
    const response = await api.get("/filter-schedules/overdue-summary/");
    return response.data as {
      replacement?: number;
      cleaning?: number;
      integrity?: number;
    };
  },
};

// Instrument API functions
export const instrumentAPI = {
  list: async () => {
    const response = await api.get('/instruments/');
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/instruments/${id}/`);
    return response.data;
  },

  create: async (data: {
    name: string;
    make: string;
    model: string;
    serial_number: string;
    id_number?: string;
    calibration_date: string;
    calibration_due_date: string;
    certificate_url?: string;
    site_id?: string;
  }) => {
    const response = await api.post('/instruments/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/instruments/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/instruments/${id}/`);
  },
};

// Chemical Preparation API functions
export const chemicalPrepAPI = {
  list: async (params?: { equipment_name?: string; date_from?: string; date_to?: string }) => {
    const response = await api.get('/chemical-preps/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },
  missingSlots: async (params?: { date?: string; equipment_name?: string }) => {
    const response = await api.get<MissingSlotsResponse>('/chemical-preps/missing-slots/', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/chemical-preps/${id}/`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post('/chemical-preps/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/chemical-preps/${id}/`, data);
    return response.data;
  },

  patch: async (id: string, data: any) => {
    const response = await api.patch(`/chemical-preps/${id}/`, data);
    return response.data;
  },

  approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
    const response = await api.post(`/chemical-preps/${id}/approve/`, {
      action,
      remarks,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/chemical-preps/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/chemical-preps/${id}/correct/`, data);
    return response.data;
  },
};

// Chemical master & stock API functions
export const chemicalMasterAPI = {
  list: async () => {
    const response = await api.get('/chemicals/');
    const data = response.data;
    if (data && (data as any).results) {
      return (data as any).results;
    }
    return Array.isArray(data) ? data : [];
  },
};

export const chemicalStockAPI = {
  list: async (params?: { chemical?: string; location?: string }) => {
    const response = await api.get('/chemical-stock/', { params });
    const data = response.data;
    if (data && (data as any).results) {
      return (data as any).results;
    }
    return Array.isArray(data) ? data : [];
  },

  /** Computed available stock (initial stock minus all logged consumption) for a chemical. */
  getAvailable: async (chemicalId: string): Promise<{
    available_qty_kg: number;
    unit: string;
    price_per_unit: number | null;
  }> => {
    const response = await api.get('/chemical-stock/available/', {
      params: { chemical: chemicalId },
    });
    return response.data;
  },

  createEntry: async (data: {
    category_id?: string;
    location?: string;
    chemical_name: string;
    chemical_formula?: string;
    stock: number;
    price?: number | null;
    site?: string | null;
  }) => {
    const response = await api.post('/chemical-stock/create_entry/', data);
    return response.data;
  },

  update: async (
    id: string,
    data: { available_qty_kg?: number; unit?: string; price_per_unit?: number | null; site?: string | null }
  ) => {
    const response = await api.patch(`/chemical-stock/${id}/`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/chemical-stock/${id}/`);
  },
};

export const chemicalAssignmentAPI = {
  list: async () => {
    const response = await api.get('/chemical-assignments/');
    const data = response.data;
    if (data && (data as any).results) {
      return (data as any).results;
    }
    return Array.isArray(data) ? data : [];
  },
  create: async (data: {
    chemical?: string;
    location?: string;
    chemical_name?: string;
    chemical_formula?: string;
    equipment_name: string;
    category: 'major' | 'minor';
  }) => {
    const response = await api.post('/chemical-assignments/', data);
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/chemical-assignments/${id}/`);
  },
  approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
    const response = await api.post(`/chemical-assignments/${id}/approve/`, { action, remarks });
    return response.data;
  },
};

// Chiller Log API functions
export const chillerLogAPI = {
  list: async (params?: { date_from?: string; date_to?: string; equipment_id?: string }) => {
    const response = await api.get('/chiller-logs/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },
  missingSlots: async (params?: { date?: string; equipment_id?: string }) => {
    const response = await api.get<MissingSlotsResponse>('/chiller-logs/missing-slots/', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/chiller-logs/${id}/`);
    return response.data;
  },

  create: async (data: {
    equipment_id: string;
    site_id?: string;
    remarks?: string;
  }) => {
    const response = await api.post('/chiller-logs/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/chiller-logs/${id}/`, data);
    return response.data;
  },

  patch: async (id: string, data: any) => {
    const response = await api.patch(`/chiller-logs/${id}/`, data);
    return response.data;
  },

  approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
    const response = await api.post(`/chiller-logs/${id}/approve/`, {
      action,
      remarks,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/chiller-logs/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/chiller-logs/${id}/correct/`, data);
    return response.data;
  },
};

// Chiller equipment daily limits (power, water, chemical) – Manager/Super Admin only
export const chillerLimitsAPI = {
  list: async (params?: { equipment_id?: string }) => {
    const response = await api.get('/chiller-limits/', { params });
    if ((response.data as any).results) return (response.data as any).results;
    return Array.isArray(response.data) ? response.data : [];
  },
  get: async (equipmentId: string) => {
    const response = await api.get(`/chiller-limits/${encodeURIComponent(equipmentId)}/`);
    return response.data;
  },
  create: async (data: {
    equipment_id: string;
    client_id?: string;
    effective_from?: string | null;
    daily_power_limit_kw?: number | null;
    electricity_rate_rs_per_kwh?: number | null;
    daily_water_ct1_liters?: number | null;
    daily_water_ct2_liters?: number | null;
    daily_water_ct3_liters?: number | null;
    daily_chemical_ct1_kg?: number | null;
    daily_chemical_ct2_kg?: number | null;
    daily_chemical_ct3_kg?: number | null;
  }) => {
    const response = await api.post('/chiller-limits/', data);
    return response.data;
  },
  update: async (equipmentId: string, data: Partial<{
    client_id: string | null;
    effective_from: string | null;
    daily_power_limit_kw: number | null;
    electricity_rate_rs_per_kwh: number | null;
    daily_water_ct1_liters: number | null;
    daily_water_ct2_liters: number | null;
    daily_water_ct3_liters: number | null;
    daily_chemical_ct1_kg: number | null;
    daily_chemical_ct2_kg: number | null;
    daily_chemical_ct3_kg: number | null;
  }>) => {
    const response = await api.patch(`/chiller-limits/${encodeURIComponent(equipmentId)}/`, data);
    return response.data;
  },
};

// Chiller dashboard summary (power, limit, projected, cost, efficiency)
export type ChillerDashboardSummary = {
  period_type: 'day' | 'month' | 'year';
  period_start: string;
  period_end: string;
  days_in_period: number;
  actual_power_kwh: number;
  limit_power_kwh: number;
  utilization_pct: number | null;
  kwh_per_day: number;
  by_equipment: { equipment_id: string; actual_power_kwh: number; limit_power_kwh: number }[];
  projected_power_kwh?: number;
  actual_cost_rs?: number;
  projected_cost_rs?: number;
};

export type ChillerDashboardSeriesPoint = {
  date: string;
  label: string;
  limit_power_kwh: number;
  actual_power_kwh: number;
  projected_power_kwh?: number | null;
  actual_cost_rs?: number | null;
  projected_cost_rs?: number | null;
};

export type ChillerDashboardSeries = {
  series: ChillerDashboardSeriesPoint[];
};

export const chillerDashboardAPI = {
  getSummary: async (params: {
    periodType: 'day' | 'month' | 'year';
    date: string;
    equipmentId?: string | null;
  }) => {
    const response = await api.get<ChillerDashboardSummary>('/chiller-logs/dashboard_summary/', {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentId ? { equipment_id: params.equipmentId } : {}),
      },
    });
    return response.data;
  },
  getSeries: async (params: {
    periodType: 'day' | 'month' | 'year';
    date: string;
    equipmentId?: string | null;
    days?: number;
  }) => {
    const response = await api.get<ChillerDashboardSeries>('/chiller-logs/dashboard_series/', {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentId ? { equipment_id: params.equipmentId } : {}),
        ...(params.days != null ? { days: params.days } : {}),
      },
    });
    return response.data;
  },
};

export type ChemicalDashboardSummary = {
  period_type: 'day' | 'month' | 'year';
  period_start: string;
  period_end: string;
  days_in_period: number;
  by_chemical: {
    chemical_id: string | null;
    chemical_name: string;
    consumption_kg: number;
    cost_rs: number | null;
  }[];
  total_consumption_kg: number;
  total_cost_rs: number;
  projected_consumption_kg?: number;
  projected_cost_rs?: number;
};

export type ChemicalDashboardSeriesPoint = {
  date: string;
  label: string;
  actual_consumption_kg: number;
  projected_consumption_kg: number;
  actual_cost_rs: number;
  projected_cost_rs: number;
};

export const chemicalDashboardAPI = {
  getEquipmentNames: async (): Promise<{ equipment_names: string[] }> => {
    const response = await api.get<{ equipment_names: string[] }>('/chemical-preps/equipment_names/');
    return response.data;
  },
  getSummary: async (params: {
    periodType: 'day' | 'month' | 'year';
    date: string;
    equipmentName?: string | null;
  }) => {
    const response = await api.get<ChemicalDashboardSummary>('/chemical-preps/dashboard_summary/', {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentName ? { equipment_name: params.equipmentName } : {}),
      },
    });
    return response.data;
  },
  getSeries: async (params: {
    periodType: 'day' | 'month' | 'year';
    date: string;
    equipmentName?: string | null;
    days?: number;
  }) => {
    const response = await api.get<{ series: ChemicalDashboardSeriesPoint[] }>(
      '/chemical-preps/dashboard_series/',
      {
        params: {
          period_type: params.periodType,
          date: params.date,
          ...(params.equipmentName ? { equipment_name: params.equipmentName } : {}),
          ...(params.days != null ? { days: params.days } : {}),
        },
      }
    );
    return response.data;
  },
};

export type FiltersDashboardSummary = {
  period_type: 'week' | 'month';
  period_start: string;
  period_end: string;
  replacement_count: number;
  cleaning_count: number;
  integrity_count: number;
  total_consumption: number;
  total_cost_rs: number;
  projected_replacement_count?: number;
  projected_cleaning_count?: number;
  projected_integrity_count?: number;
  projected_consumption?: number;
  projected_cost_rs?: number;
};

export const filtersDashboardAPI = {
  getSummary: async (params: { periodType: 'week' | 'month'; date: string; equipmentId?: string }) => {
    const response = await api.get<FiltersDashboardSummary>('/filter-schedules/dashboard_summary/', {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentId ? { equipment_id: params.equipmentId } : {}),
      },
    });
    return response.data;
  },
};

// Boiler Log API functions
export const boilerLogAPI = {
  list: async (params?: { date_from?: string; date_to?: string; equipment_id?: string }) => {
    const response = await api.get('/boiler-logs/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },
  missingSlots: async (params?: { date?: string; equipment_id?: string }) => {
    const response = await api.get<MissingSlotsResponse>('/boiler-logs/missing-slots/', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/boiler-logs/${id}/`);
    return response.data;
  },

  create: async (data: {
    equipment_id: string;
    site_id?: string;
    feed_water_temp: number;
    oil_temp: number;
    steam_temp: number;
    steam_pressure: number;
    steam_flow_lph?: number;
    fo_hsd_ng_day_tank_level?: number;
    feed_water_tank_level?: number;
    fo_pre_heater_temp?: number;
    burner_oil_pressure?: number;
    burner_heater_temp?: number;
    boiler_steam_pressure?: number;
    stack_temperature?: number;
    steam_pressure_after_prv?: number;
    feed_water_hardness_ppm?: number;
    feed_water_tds_ppm?: number;
    fo_hsd_ng_consumption?: number;
    mobrey_functioning?: string;
    manual_blowdown_time?: string;
    diesel_stock_liters?: number | null;
    diesel_cost_rupees?: number | null;
    furnace_oil_stock_liters?: number | null;
    furnace_oil_cost_rupees?: number | null;
    brigade_stock_kg?: number | null;
    brigade_cost_rupees?: number | null;
    daily_power_consumption_kwh?: number | null;
    daily_water_consumption_liters?: number | null;
    daily_chemical_consumption_kg?: number | null;
    daily_diesel_consumption_liters?: number | null;
    daily_furnace_oil_consumption_liters?: number | null;
    daily_brigade_consumption_kg?: number | null;
    steam_consumption_kg_hr?: number | null;
    remarks?: string;
  }) => {
    const response = await api.post('/boiler-logs/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/boiler-logs/${id}/`, data);
    return response.data;
  },

  patch: async (id: string, data: any) => {
    const response = await api.patch(`/boiler-logs/${id}/`, data);
    return response.data;
  },

  approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
    const response = await api.post(`/boiler-logs/${id}/approve/`, {
      action,
      remarks,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/boiler-logs/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/boiler-logs/${id}/correct/`, data);
    return response.data;
  },
};

export const briquetteLogAPI = {
  list: async (params?: { date_from?: string; date_to?: string; equipment_id?: string }) => {
    const response = await api.get('/briquette-logs/', { params });
    if (response.data.results) return response.data.results;
    return Array.isArray(response.data) ? response.data : [];
  },
  missingSlots: async (params?: { date?: string; equipment_id?: string }) => {
    const response = await api.get<MissingSlotsResponse>('/briquette-logs/missing-slots/', { params });
    return response.data;
  },
  get: async (id: string) => {
    const response = await api.get(`/briquette-logs/${id}/`);
    return response.data;
  },
  create: async (data: any) => {
    const response = await api.post('/briquette-logs/', data);
    return response.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.put(`/briquette-logs/${id}/`, data);
    return response.data;
  },
  patch: async (id: string, data: any) => {
    const response = await api.patch(`/briquette-logs/${id}/`, data);
    return response.data;
  },
  approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
    const response = await api.post(`/briquette-logs/${id}/approve/`, { action, remarks });
    return response.data;
  },
  delete: async (id: string) => {
    await api.delete(`/briquette-logs/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/briquette-logs/${id}/correct/`, data);
    return response.data;
  },
  backfillReports: async () => {
    const response = await api.post('/briquette-logs/backfill-reports/');
    return response.data;
  },
};

// Boiler equipment daily limits (power, water, chemical)
export const boilerLimitsAPI = {
  list: async (params?: { equipment_id?: string }) => {
    const response = await api.get('/boiler-limits/', { params });
    if ((response.data as any).results) return (response.data as any).results;
    return Array.isArray(response.data) ? response.data : [];
  },
  get: async (equipmentId: string) => {
    const response = await api.get(`/boiler-limits/${encodeURIComponent(equipmentId)}/`);
    return response.data;
  },
  create: async (data: {
    equipment_id: string;
    client_id?: string | null;
    effective_from?: string | null;
    daily_power_limit_kw?: number | null;
    daily_water_limit_liters?: number | null;
    daily_chemical_limit_kg?: number | null;
    daily_diesel_limit_liters?: number | null;
    daily_furnace_oil_limit_liters?: number | null;
    daily_brigade_limit_kg?: number | null;
    daily_steam_limit_kg_hr?: number | null;
    electricity_rate_rs_per_kwh?: number | null;
    diesel_rate_rs_per_liter?: number | null;
    furnace_oil_rate_rs_per_liter?: number | null;
    brigade_rate_rs_per_kg?: number | null;
  }) => {
    const response = await api.post('/boiler-limits/', data);
    return response.data;
  },
  update: async (equipmentId: string, data: Partial<{
    client_id: string | null;
    effective_from: string | null;
    daily_power_limit_kw: number | null;
    daily_water_limit_liters: number | null;
    daily_chemical_limit_kg: number | null;
    daily_diesel_limit_liters: number | null;
    daily_furnace_oil_limit_liters: number | null;
    daily_brigade_limit_kg: number | null;
    daily_steam_limit_kg_hr: number | null;
    electricity_rate_rs_per_kwh: number | null;
    diesel_rate_rs_per_liter: number | null;
    furnace_oil_rate_rs_per_liter: number | null;
    brigade_rate_rs_per_kg: number | null;
  }>) => {
    const response = await api.patch(`/boiler-limits/${encodeURIComponent(equipmentId)}/`, data);
    return response.data;
  },
};

// Boiler dashboard summary (power, limit, projected, cost, efficiency, per-fuel for dropdown)
export type BoilerDashboardSummary = {
  period_type: 'day' | 'month' | 'year';
  period_start: string;
  period_end: string;
  days_in_period: number;
  has_boiler_equipment?: boolean;
  actual_power_kwh: number;
  limit_power_kwh: number;
  actual_oil_liters?: number;
  limit_oil_liters?: number;
  actual_diesel_liters?: number;
  limit_diesel_liters?: number;
  actual_furnace_oil_liters?: number;
  limit_furnace_oil_liters?: number;
  actual_brigade_kg?: number;
  limit_brigade_kg?: number;
  actual_steam_kg_hr?: number;
  limit_steam_kg_hr?: number;
  efficiency_ratio?: number | null;
  utilization_pct?: number | null;
  kwh_per_day?: number;
  by_equipment?: { equipment_id: string; actual_power_kwh: number; limit_power_kwh: number }[];
  projected_power_kwh?: number;
  actual_cost_rs?: number;
  projected_cost_rs?: number;
};

export type BoilerDashboardSeriesPoint = {
  date: string;
  label: string;
  actual_power_kwh?: number;
  projected_power_kwh?: number;
  actual_cost_rs?: number;
  projected_cost_rs?: number;
  actual_diesel_liters?: number;
  projected_diesel_liters?: number;
  actual_furnace_oil_liters?: number;
  projected_furnace_oil_liters?: number;
  actual_brigade_kg?: number;
  projected_brigade_kg?: number;
  actual_steam_kg_hr?: number;
  projected_steam_kg_hr?: number;
};

export const boilerDashboardAPI = {
  getSummary: async (params: {
    periodType: 'day' | 'month' | 'year';
    date: string;
    equipmentId?: string | null;
  }) => {
    const response = await api.get<BoilerDashboardSummary>('/boiler-logs/dashboard_summary/', {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentId ? { equipment_id: params.equipmentId } : {}),
      },
    });
    return response.data;
  },
  getSeries: async (params: {
    periodType: 'day' | 'month' | 'year';
    date: string;
    equipmentId?: string | null;
    days?: number;
  }) => {
    const response = await api.get<{ series: BoilerDashboardSeriesPoint[] }>('/boiler-logs/dashboard_series/', {
      params: {
        period_type: params.periodType,
        date: params.date,
        ...(params.equipmentId ? { equipment_id: params.equipmentId } : {}),
        ...(params.days != null ? { days: params.days } : {}),
      },
    });
    return response.data;
  },
};

// Filter Log API functions
export const filterLogAPI = {
  list: async (params?: { date_from?: string; date_to?: string; equipment_id?: string; status?: string }) => {
    const response = await api.get('/filter-logs/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },
  missingSlots: async (params?: { date?: string; equipment_id?: string }) => {
    const response = await api.get<MissingSlotsResponse>('/filter-logs/missing-slots/', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/filter-logs/${id}/`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post('/filter-logs/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/filter-logs/${id}/`, data);
    return response.data;
  },

  patch: async (id: string, data: any) => {
    const response = await api.patch(`/filter-logs/${id}/`, data);
    return response.data;
  },

  approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
    const response = await api.post(`/filter-logs/${id}/approve/`, {
      action,
      remarks,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/filter-logs/${id}/`);
  },
  correct: async (id: string, data: any) => {
    const response = await api.post(`/filter-logs/${id}/correct/`, data);
    return response.data;
  },
};

// Compressor Log API functions
export const compressorLogAPI = {
  list: async (params?: { date_from?: string; date_to?: string; equipment_id?: string }) => {
    const response = await api.get('/compressor-logs/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/compressor-logs/${id}/`);
    return response.data;
  },

  create: async (data: {
    equipment_id: string;
    site_id?: string;
    compressor_supply_temp: number;
    compressor_return_temp: number;
    compressor_pressure: number;
    compressor_flow?: number;
    remarks?: string;
  }) => {
    const response = await api.post('/compressor-logs/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/compressor-logs/${id}/`, data);
    return response.data;
  },

  approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
    const response = await api.post(`/compressor-logs/${id}/approve/`, {
      action,
      remarks,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/compressor-logs/${id}/`);
  },
};

// HVAC Validation API functions
export const hvacValidationAPI = {
  list: async () => {
    const response = await api.get('/hvac-validations/');
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/hvac-validations/${id}/`);
    return response.data;
  },

  create: async (data: {
    room_name: string;
    iso_class: 5 | 6 | 7 | 8;
    room_volume: number;
    grid_readings: number[];
    average_velocity: number;
    flow_rate_cfm: number;
    total_cfm: number;
    ach: number;
    design_spec: number;
    result: 'pass' | 'fail';
  }) => {
    const response = await api.post('/hvac-validations/', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/hvac-validations/${id}/`, data);
    return response.data;
  },

  approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
    const response = await api.post(`/hvac-validations/${id}/approve/`, {
      action,
      remarks,
    });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/hvac-validations/${id}/`);
  },
};

// Test Certificate API functions
export const testCertificateAPI = {
  // Air Velocity Test
  airVelocity: {
    list: async () => {
      const response = await api.get('/air-velocity-tests/');
      if (response.data.results) {
        return response.data.results;
      }
      return Array.isArray(response.data) ? response.data : [];
    },
    get: async (id: string) => {
      const response = await api.get(`/air-velocity-tests/${id}/`);
      return response.data;
    },
    create: async (data: any) => {
      const response = await api.post('/air-velocity-tests/', data);
      return response.data;
    },
    update: async (id: string, data: any) => {
      const response = await api.put(`/air-velocity-tests/${id}/`, data);
      return response.data;
    },
    approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
      const response = await api.post(`/air-velocity-tests/${id}/approve/`, {
        action,
        remarks,
      });
      return response.data;
    },
    delete: async (id: string) => {
      await api.delete(`/air-velocity-tests/${id}/`);
    },
  },

  // Filter Integrity Test
  filterIntegrity: {
    list: async () => {
      const response = await api.get('/filter-integrity-tests/');
      if (response.data.results) {
        return response.data.results;
      }
      return Array.isArray(response.data) ? response.data : [];
    },
    get: async (id: string) => {
      const response = await api.get(`/filter-integrity-tests/${id}/`);
      return response.data;
    },
    create: async (data: any) => {
      const response = await api.post('/filter-integrity-tests/', data);
      return response.data;
    },
    update: async (id: string, data: any) => {
      const response = await api.put(`/filter-integrity-tests/${id}/`, data);
      return response.data;
    },
    approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
      const response = await api.post(`/filter-integrity-tests/${id}/approve/`, {
        action,
        remarks,
      });
      return response.data;
    },
    delete: async (id: string) => {
      await api.delete(`/filter-integrity-tests/${id}/`);
    },
  },

  // Recovery Test
  recovery: {
    list: async () => {
      const response = await api.get('/recovery-tests/');
      if (response.data.results) {
        return response.data.results;
      }
      return Array.isArray(response.data) ? response.data : [];
    },
    get: async (id: string) => {
      const response = await api.get(`/recovery-tests/${id}/`);
      return response.data;
    },
    create: async (data: any) => {
      const response = await api.post('/recovery-tests/', data);
      return response.data;
    },
    update: async (id: string, data: any) => {
      const response = await api.put(`/recovery-tests/${id}/`, data);
      return response.data;
    },
    approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
      const response = await api.post(`/recovery-tests/${id}/approve/`, {
        action,
        remarks,
      });
      return response.data;
    },
    delete: async (id: string) => {
      await api.delete(`/recovery-tests/${id}/`);
    },
  },

  // Differential Pressure Test
  differentialPressure: {
    list: async () => {
      const response = await api.get('/differential-pressure-tests/');
      if (response.data.results) {
        return response.data.results;
      }
      return Array.isArray(response.data) ? response.data : [];
    },
    get: async (id: string) => {
      const response = await api.get(`/differential-pressure-tests/${id}/`);
      return response.data;
    },
    create: async (data: any) => {
      const response = await api.post('/differential-pressure-tests/', data);
      return response.data;
    },
    update: async (id: string, data: any) => {
      const response = await api.put(`/differential-pressure-tests/${id}/`, data);
      return response.data;
    },
    approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
      const response = await api.post(`/differential-pressure-tests/${id}/approve/`, {
        action,
        remarks,
      });
      return response.data;
    },
    delete: async (id: string) => {
      await api.delete(`/differential-pressure-tests/${id}/`);
    },
  },

  // NVPC Test
  nvpc: {
    list: async () => {
      const response = await api.get('/nvpc-tests/');
      if (response.data.results) {
        return response.data.results;
      }
      return Array.isArray(response.data) ? response.data : [];
    },
    get: async (id: string) => {
      const response = await api.get(`/nvpc-tests/${id}/`);
      return response.data;
    },
    create: async (data: any) => {
      const response = await api.post('/nvpc-tests/', data);
      return response.data;
    },
    update: async (id: string, data: any) => {
      const response = await api.put(`/nvpc-tests/${id}/`, data);
      return response.data;
    },
    approve: async (id: string, action: 'approve' | 'reject', remarks?: string) => {
      const response = await api.post(`/nvpc-tests/${id}/approve/`, {
        action,
        remarks,
      });
      return response.data;
    },
    delete: async (id: string) => {
      await api.delete(`/nvpc-tests/${id}/`);
    },
  },
};

// Dashboard summary (Quick Stats) and weekly consumption
export type DashboardSummary = {
  active_chillers_count: number;
  avg_pressure_bar: number | null;
  pending_approvals_count: number;
  approved_today_count: number;
  total_log_entries: number;
  hvac_validations_pending_count: number;
  active_alerts: number;
  compliance_score: number | null;
};

export type WeeklyConsumptionDay = {
  date: string;
  day_label: string;
  chemical_kg: number;
  steam_kg: number;
  fuel_liters: number;
};

export type DailyConsumptionChillerRow = {
  date: string | null;
  equipment_id: string;
  equipment_number: string;
  power_kwh: number;
  water_ct1_l: number;
  water_ct2_l: number;
  water_ct3_l: number;
  chemical_ct1_kg: number;
  chemical_ct2_kg: number;
  chemical_ct3_kg: number;
};

export type DailyConsumptionBoilerRow = {
  date: string | null;
  equipment_id: string;
  equipment_number: string;
  power_kwh: number;
  water_l: number;
  chemical_kg: number;
  diesel_l: number;
  furnace_oil_l: number;
  brigade_kg: number;
  steam_kg_hr: number;
};

export type DailyConsumptionChemicalRow = {
  date: string | null;
  chemical_kg: number;
};

export type DailyConsumptionResponse = {
  chiller?: DailyConsumptionChillerRow[];
  boiler?: DailyConsumptionBoilerRow[];
  chemical?: DailyConsumptionChemicalRow[];
};

export type RecentActivityItem = {
  id: string;
  type: 'utility' | 'chemical' | 'validation';
  action: string;
  operator: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
};

export type EquipmentStatusItem = {
  id: string;
  name: string;
  equipment_number: string;
  type: 'chiller' | 'boiler' | 'compressor';
  status: 'running' | 'idle' | 'alert';
  t1: number | null;
  t2: number | null;
  p1: number | null;
  p2: number | null;
};

export const dashboardSummaryAPI = {
  getSummary: async () => {
    const response = await api.get<DashboardSummary>('/reports/dashboard_summary/');
    return response.data;
  },
  getWeeklyConsumption: async (params?: { date?: string }) => {
    const response = await api.get<WeeklyConsumptionDay[]>('/reports/weekly_consumption/', {
      params: params ? { date: params.date } : {},
    });
    return Array.isArray(response.data) ? response.data : [];
  },
  getRecentActivity: async (limit?: number) => {
    const response = await api.get<RecentActivityItem[]>('/reports/recent_activity/', {
      params: limit != null ? { limit } : {},
    });
    return Array.isArray(response.data) ? response.data : [];
  },
  getEquipmentStatus: async () => {
    const response = await api.get<EquipmentStatusItem[]>('/reports/equipment_status/');
    return Array.isArray(response.data) ? response.data : [];
  },
  getDailyConsumption: async (params?: {
    date_from?: string;
    date_to?: string;
    equipment_id?: string;
    type?: 'chiller' | 'boiler' | 'chemical';
  }) => {
    const response = await api.get<DailyConsumptionResponse>('/reports/daily_consumption/', {
      params: params ?? {},
    });
    return response.data;
  },
  saveDailyConsumption: async (payload: {
    type: 'chiller' | 'boiler' | 'chemical';
    date: string;
    equipment_id?: string;
    power_kwh?: number;
    water_ct1_l?: number;
    water_ct2_l?: number;
    water_ct3_l?: number;
    chemical_ct1_kg?: number;
    chemical_ct2_kg?: number;
    chemical_ct3_kg?: number;
    water_l?: number;
    chemical_kg?: number;
    diesel_l?: number;
    furnace_oil_l?: number;
    brigade_kg?: number;
    steam_kg_hr?: number;
  }) => {
    const response = await api.post('/reports/daily_consumption/', payload);
    return response.data;
  },
};

// Reports API functions
export const reportsAPI = {
  list: async (params?: { type?: string }) => {
    const response = await api.get('/reports/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/reports/${id}/`);
    return response.data;
  },

  // User management report
  listUsers: async (params?: { role?: string; is_active?: string; activity_date?: string }) => {
    const response = await api.get('/reports/users/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  // User activity report
  listUserActivity: async (params?: {
    from_date?: string;
    to_date?: string;
    user?: string;
    event_type?: string;
  }) => {
    const response = await api.get('/reports/user-activity/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  // Audit trail report
  listAuditEvents: async (params?: {
    from_date?: string;
    to_date?: string;
    user?: string;
    object_type?: string;
    object_id?: string;
    event_type?: string;
  }) => {
    const response = await api.get('/reports/audit/', { params });
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },
};

export default api;

