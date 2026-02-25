import axios from 'axios';

// Single Axios instance used across the app.
// Let Axios/browser set the appropriate Content-Type automatically
// (JSON for normal requests, multipart with boundary for FormData uploads).
const api = axios.create({
  baseURL: '/api'
});

export default api;
