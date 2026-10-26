export interface HealthResponse {
  status: string;
  database: string;
}

export interface ConfigResponse {
  demoMode: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const ROOT_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${ROOT_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const response = await fetch(`${API_BASE_URL}/config`);
  if (!response.ok) {
    throw new Error(`Config request returned HTTP ${response.status}`);
  }
  return response.json();
}
