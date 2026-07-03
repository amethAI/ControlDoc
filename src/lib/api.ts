export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers || {});

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  return response;
};
