import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

// Include User-Id header for multi-tenancy support
api.interceptors.request.use((config) => {
  const userId = localStorage.getItem('cloud_user_id');
  if (userId) {
    config.headers['X-User-Id'] = userId;
  }
  return config;
});

export default api;
