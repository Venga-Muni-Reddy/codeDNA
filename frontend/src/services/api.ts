/// <reference types="vite/client" />
import axios from 'axios';
import { useAppStore } from '../store/useAppStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
});

// Automatically inject JWT token into header
api.interceptors.request.use(
  (config) => {
    const token = useAppStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Automate token refreshing on 401 response codes
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = useAppStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = res.data.data;

          const user = useAppStore.getState().user;
          if (user) {
            useAppStore.getState().setAuth(user, accessToken, newRefreshToken);
          }

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          useAppStore.getState().clearAuth();
          return Promise.reject(refreshError);
        }
      }
    }
    return Promise.reject(error);
  }
);

// Endpoints mapping
export const authService = {
  register: async (name: string, email: string, password: string) => {
    const res = await api.post('/auth/register', { name, email, password });
    return res.data;
  },
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },
  logout: async (refreshToken: string) => {
    const res = await api.post('/auth/logout', { refreshToken });
    return res.data;
  },
};

export const projectService = {
  list: async () => {
    const res = await api.get('/projects');
    return res.data.data.projects;
  },
  get: async (id: string) => {
    const res = await api.get(`/projects/${id}`);
    return res.data.data.project;
  },
  importGit: async (name: string, repoUrl: string, branch?: string) => {
    const res = await api.post('/projects/import-git', { name, repoUrl, branch });
    return res.data.data.project;
  },
  uploadZip: async (name: string, file: File) => {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('file', file);
    const res = await api.post('/projects/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data.data.project;
  },
  delete: async (id: string) => {
    const res = await api.delete(`/projects/${id}`);
    return res.data;
  },
  getDependencies: async (id: string) => {
    const res = await api.get(`/projects/${id}/dependencies`);
    return res.data.data;
  },
  getArchitecture: async (id: string) => {
    const res = await api.get(`/projects/${id}/architecture`);
    return res.data.data;
  },
  getDocumentation: async (id: string) => {
    const res = await api.get(`/projects/${id}/documentation`);
    return res.data.data;
  },
  explain: async (id: string, query: string, filePath?: string) => {
    const res = await api.post(`/projects/${id}/explain`, { query, filePath });
    return res.data.data.explanation;
  },
};
