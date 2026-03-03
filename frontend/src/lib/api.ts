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

  // Session / activity settings
  getSessionSettings: async () => {
    const response = await api.get('/settings/session/');
    return response.data;
  },

  updateSessionSettings: async (data: { auto_logout_minutes: number }) => {
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
  list: async () => {
    const response = await api.get('/chemical-preps/');
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
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
};

// Chiller Log API functions
export const chillerLogAPI = {
  list: async () => {
    const response = await api.get('/chiller-logs/');
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: string) => {
    const response = await api.get(`/chiller-logs/${id}/`);
    return response.data;
  },

  create: async (data: {
    equipment_id: string;
    site_id?: string;
    chiller_supply_temp: number;
    chiller_return_temp: number;
    cooling_tower_supply_temp: number;
    cooling_tower_return_temp: number;
    ct_differential_temp: number;
    chiller_water_inlet_pressure: number;
    chiller_makeup_water_flow?: number;
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
};

// Boiler Log API functions
export const boilerLogAPI = {
  list: async () => {
    const response = await api.get('/boiler-logs/');
    if (response.data.results) {
      return response.data.results;
    }
    return Array.isArray(response.data) ? response.data : [];
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
};

// Compressor Log API functions
export const compressorLogAPI = {
  list: async () => {
    const response = await api.get('/compressor-logs/');
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

