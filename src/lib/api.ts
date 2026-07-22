export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers || {});

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !url.includes('/api/auth/')) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  return response;
};
