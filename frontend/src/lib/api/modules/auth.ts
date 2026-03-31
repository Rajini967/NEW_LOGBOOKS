import api from "../client";

export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post("/auth/login/", { email, password });
    const { access, refresh } = response.data;

    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);

    return response.data;
  },

  logout: async (reason?: "auto") => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      try {
        const url = reason === "auto" ? "/auth/logout/?reason=auto" : "/auth/logout/";
        await api.post(url, { refresh: refreshToken });
      } catch (error) {
        console.error("Logout error:", error);
      }
    }

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  },

  refreshToken: async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await api.post("/auth/refresh/", { refresh: refreshToken });
    const { access } = response.data;
    localStorage.setItem("access_token", access);

    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get("/users/me/");
    return response.data;
  },

  requestPasswordReset: async (email: string) => {
    const response = await api.post("/auth/forgot-password/", { email });
    return response.data;
  },

  validatePasswordResetToken: async (token: string) => {
    const response = await api.post("/auth/validate-reset-token/", { token });
    return response.data;
  },

  resetPassword: async (payload: { token: string; new_password: string; confirm_password: string }) => {
    const response = await api.post("/auth/reset-password/", payload);
    return response.data;
  },

  changePassword: async (payload: {
    current_password: string;
    new_password: string;
    new_password_confirm: string;
  }) => {
    const response = await api.post("/auth/change-password/", payload);
    return response.data;
  },

  getSessionSettings: async () => {
    const response = await api.get("/settings/session/");
    return response.data;
  },

  updateSessionSettings: async (data: {
    auto_logout_minutes?: number;
    password_expiry_days?: number | null;
    log_entry_interval?: "hourly" | "shift" | "daily";
    shift_duration_hours?: number;
  }) => {
    const response = await api.patch("/settings/session/", data);
    return response.data;
  },
};
