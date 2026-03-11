import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Attach token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const registerUser = (data) => API.post('/auth/register', data);
export const loginUser = (data) => API.post('/auth/login', data);
export const getMe = () => API.get('/auth/me');

// Vault APIs
export const storeData = (data) => API.post('/vault/store', data);
export const getVaultItems = () => API.get('/vault/items');
export const retrieveData = (id) => API.get(`/vault/retrieve/${id}`);
export const deleteVaultItem = (id) => API.delete(`/vault/delete/${id}`);

// Audit APIs
export const getAuditLogs = (params) => API.get('/audit/logs', { params });
export const getMyLogs = (params) => API.get('/audit/my-logs', { params });
export const getAuditStats = () => API.get('/audit/stats');

export default API;
