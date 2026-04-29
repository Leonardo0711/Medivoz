import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const refreshAuthSession = async (refreshToken: string) => {
  const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
  const { accessToken, refreshToken: rotatedRefreshToken, user } = response.data;

  localStorage.setItem('access_token', accessToken);
  if (rotatedRefreshToken) {
    localStorage.setItem('refresh_token', rotatedRefreshToken);
  }
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  return { accessToken, refreshToken: rotatedRefreshToken, user };
};

// Interceptor to add the access token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor to handle expired tokens
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');
      
      if (refreshToken) {
        try {
          await refreshAuthSession(refreshToken);
          
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh token also failed, logout
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
  
