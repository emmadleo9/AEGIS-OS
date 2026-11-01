import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('aegis-api-key');
  if (apiKey) {
    config.headers['x-api-key'] = apiKey;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('aegis-api-key');
    }
    return Promise.reject(error);
  }
);