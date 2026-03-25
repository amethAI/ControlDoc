export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');

  const headers = new Headers(options.headers || {});
  
  // Only add token for internal API requests
  if (token && url.startsWith('/api')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
};
