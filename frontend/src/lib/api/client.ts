import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

type ErrorData = {
  detail?: string;
  message?: string;
  error?: string;
};

export interface ApiClientError extends Error {
  status?: number;
  statusText?: string;
  data?: unknown;
  originalError?: AxiosError;
}

function extractErrorMessage(data: unknown): string {
  if (!data) {
    return "";
  }
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "object") {
    const record = data as ErrorData;
    if (typeof record.detail === "string") return record.detail;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
  }
  return JSON.stringify(data);
}

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh/`, {
            refresh: refreshToken,
          });

          const { access } = response.data;
          localStorage.setItem("access_token", access);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access}`;
          }
          return api(originalRequest);
        }
      } catch (refreshError) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    const errorMessage =
      extractErrorMessage(error.response?.data) || error.message || "An unexpected error occurred";

    console.error("API Error:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: errorMessage,
      url: originalRequest?.url,
    });

    const enhancedError: ApiClientError = new Error(errorMessage);
    enhancedError.status = error.response?.status;
    enhancedError.statusText = error.response?.statusText;
    enhancedError.data = error.response?.data;
    enhancedError.originalError = error;

    return Promise.reject(enhancedError);
  }
);

export default api;
