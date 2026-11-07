import axios from 'axios';

// Bootstrapped OpenWA admin API key (seeded on first gateway boot, stored in gateway/data/.api-key).
// Used as the default when the user has not stored a key in localStorage.
const DEFAULT_API_KEY = 'owa_k1_cb87efdf02eccc4f9f269620da351f0120ddec9784b3a44e6bf0e2f1c6fa2162';

export const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('krynara-api-key') || DEFAULT_API_KEY;
  if (apiKey) {
    config.headers['x-api-key'] = apiKey;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('krynara-api-key');
    }
    return Promise.reject(error);
  }
);