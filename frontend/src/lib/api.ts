export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Business {
  id: string;
  name: string;
  defaultCurrency: 'ETB' | 'USD';
  invoicePrefix: string;
  timezone: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  business: Business;
}

export interface HealthResponse {
  status: string;
  database: string;
}

export interface ConfigResponse {
  demoMode: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const ROOT_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

const TOKEN_KEY = 'goom_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore in storage-restricted environments
  }
}

export class ApiException extends Error {
  constructor(
    public status: number,
    public error: ApiError
  ) {
    super(error.message);
    this.name = 'ApiException';
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errData: { error?: ApiError } = {};
    try {
      errData = await response.json();
    } catch {
      // Non-JSON response
    }
    const apiError: ApiError = errData.error || {
      code: `HTTP_${response.status}`,
      message: response.statusText || `Request failed with status ${response.status}`,
    };
    throw new ApiException(response.status, apiError);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${ROOT_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchConfig(): Promise<ConfigResponse> {
  return apiRequest<ConfigResponse>('/config');
}
export const fetchConfigApi = fetchConfig;

export async function loginApi(data: { email: string; password: string }): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function registerApi(data: {
  email: string;
  password: string;
  name: string;
  businessName: string;
  defaultCurrency?: 'ETB' | 'USD';
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function demoLoginApi(): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/demo', {
    method: 'POST',
  });
}

export async function fetchMeApi(): Promise<{ user: User; business: Business }> {
  return apiRequest<{ user: User; business: Business }>('/auth/me');
}

// --- Dashboard Types & API ---
export interface CurrencySummary {
  outstandingMinor: number;
  overdueMinor: number;
  paidThisMonthMinor: number;
}

export interface DashboardSummaryResponse {
  summary: Record<string, CurrencySummary>;
  currenciesInUse?: Array<'ETB' | 'USD'>;
  hasInvoices?: boolean;
}

export interface RevenueMonthPoint {
  month: string;
  revenueMinor: number;
}

export interface DashboardRevenueResponse {
  months: number;
  revenue: Record<string, RevenueMonthPoint[]>;
}

export type AnalyticsPeriod = '7d' | '30d' | '3m' | '6m' | '12m' | 'all';

export interface AnalyticsBucketPoint {
  key: string;
  label: string;
  paidMinor: number;
  paidCount: number;
  invoicedMinor: number;
  invoicedCount: number;
}

export interface AnalyticsTotals {
  totalPaidMinor: number;
  totalPaidCount: number;
  totalInvoicedMinor: number;
  totalInvoicedCount: number;
  collectionRatePercent: number;
}

export interface DashboardAnalyticsResponse {
  period: AnalyticsPeriod;
  interval: 'day' | 'month';
  timezone: string;
  series: {
    ETB: AnalyticsBucketPoint[];
    USD: AnalyticsBucketPoint[];
  };
  totals: {
    ETB: AnalyticsTotals;
    USD: AnalyticsTotals;
  };
}

export interface DashboardActivityItem {
  invoiceId: string;
  displayNumber: string;
  clientName: string;
  currency: 'ETB' | 'USD';
  totalMinor: number;
  eventType: 'sent' | 'paid' | 'voided';
  timestamp: string;
}

export interface DashboardActivityResponse {
  activity: DashboardActivityItem[];
}

export async function fetchDashboardSummary(): Promise<DashboardSummaryResponse> {
  return apiRequest<DashboardSummaryResponse>('/dashboard/summary');
}

export async function fetchDashboardRevenue(months = 6): Promise<DashboardRevenueResponse> {
  return apiRequest<DashboardRevenueResponse>(`/dashboard/revenue?months=${months}`);
}

export async function fetchDashboardAnalytics(
  period: AnalyticsPeriod = '6m'
): Promise<DashboardAnalyticsResponse> {
  return apiRequest<DashboardAnalyticsResponse>(`/dashboard/analytics?period=${period}`);
}

export async function fetchDashboardActivity(): Promise<DashboardActivityResponse> {
  return apiRequest<DashboardActivityResponse>('/dashboard/activity');
}

// --- Clients Types & API ---
export interface Client {
  id: string;
  businessId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface ClientsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ClientsResponse {
  clients: Client[];
  pagination: ClientsPagination;
}

export interface ClientResponse {
  client: Client;
}

export interface CreateClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface UpdateClientInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export async function fetchClients(params?: {
  page?: number;
  limit?: number;
  search?: string;
  archived?: 'true' | 'false' | 'all';
}): Promise<ClientsResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.archived) query.set('archived', params.archived);
  const qStr = query.toString();
  return apiRequest<ClientsResponse>(`/clients${qStr ? `?${qStr}` : ''}`);
}

export async function fetchClient(id: string): Promise<ClientResponse> {
  return apiRequest<ClientResponse>(`/clients/${id}`);
}

export async function createClient(data: CreateClientInput): Promise<ClientResponse> {
  return apiRequest<ClientResponse>('/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateClient(id: string, data: UpdateClientInput): Promise<ClientResponse> {
  return apiRequest<ClientResponse>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function archiveClient(id: string): Promise<void> {
  return apiRequest<void>(`/clients/${id}/archive`, {
    method: 'POST',
  });
}

export async function unarchiveClient(id: string): Promise<ClientResponse> {
  return apiRequest<ClientResponse>(`/clients/${id}/unarchive`, {
    method: 'POST',
  });
}

// --- Business Profile & Settings API ---
export interface BusinessProfile {
  id: string;
  name: string;
  defaultCurrency: 'ETB' | 'USD';
  invoicePrefix: string;
  timezone: string;
  createdAt?: string;
}

export interface BusinessResponse {
  business: BusinessProfile;
}

export interface UpdateBusinessInput {
  name?: string;
  default_currency?: 'ETB' | 'USD';
  invoice_prefix?: string;
  timezone?: string;
}

export async function fetchBusiness(): Promise<BusinessResponse> {
  return apiRequest<BusinessResponse>('/business');
}

export async function updateBusiness(data: UpdateBusinessInput): Promise<BusinessResponse> {
  return apiRequest<BusinessResponse>('/business', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// --- Invoices Types & API ---

export interface InvoiceItem {
  id?: string;
  invoiceId?: string;
  position: number;
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface InvoicePayment {
  id: string;
  businessId: string;
  invoiceId: string;
  provider: 'chapa' | 'simulated';
  txRef: string;
  amountMinor: number;
  currency: 'ETB' | 'USD';
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  failureReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface Invoice {
  id: string;
  businessId: string;
  clientId: string;
  clientName: string | null;
  clientEmail: string | null;
  number: number | null;
  displayNumber: string | null;
  currency: 'ETB' | 'USD';
  status: 'draft' | 'sent' | 'paid' | 'void';
  isOverdue: boolean;
  issueDate: string;
  dueDate: string;
  taxRateBps: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  notes: string | null;
  publicToken: string;
  publicUrl: string;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItem[];
  payments: InvoicePayment[];
}

export interface InvoicesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InvoicesResponse {
  invoices: Invoice[];
  pagination: InvoicesPagination;
}

export interface InvoiceResponse {
  invoice: Invoice;
  publicUrl?: string;
}

export interface CreateInvoiceItemInput {
  description: string;
  quantityMilli?: number;
  quantity?: string | number;
  unitPriceMinor?: number;
  unitPrice?: string | number;
}

export interface CreateInvoiceInput {
  clientId?: string;
  currency?: 'ETB' | 'USD';
  issueDate?: string;
  dueDate?: string;
  taxRateBps?: number;
  notes?: string | null;
  items: CreateInvoiceItemInput[];
}

export interface UpdateInvoiceInput {
  clientId?: string;
  currency?: 'ETB' | 'USD';
  issueDate?: string;
  dueDate?: string;
  taxRateBps?: number;
  notes?: string | null;
  items?: CreateInvoiceItemInput[];
}

export async function fetchInvoices(params?: {
  page?: number;
  limit?: number;
  status?: string;
  clientId?: string;
  search?: string;
}): Promise<InvoicesResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (params?.clientId) query.set('clientId', params.clientId);
  if (params?.search) query.set('search', params.search);
  const qStr = query.toString();
  return apiRequest<InvoicesResponse>(`/invoices${qStr ? `?${qStr}` : ''}`);
}

export async function fetchInvoice(id: string): Promise<InvoiceResponse> {
  return apiRequest<InvoiceResponse>(`/invoices/${id}`);
}

export async function createInvoice(data: CreateInvoiceInput): Promise<InvoiceResponse> {
  return apiRequest<InvoiceResponse>('/invoices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInvoice(id: string, data: UpdateInvoiceInput): Promise<InvoiceResponse> {
  return apiRequest<InvoiceResponse>(`/invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  return apiRequest<void>(`/invoices/${id}`, {
    method: 'DELETE',
  });
}

export async function sendInvoice(id: string): Promise<InvoiceResponse> {
  return apiRequest<InvoiceResponse>(`/invoices/${id}/send`, {
    method: 'POST',
  });
}

export async function voidInvoice(id: string): Promise<InvoiceResponse> {
  return apiRequest<InvoiceResponse>(`/invoices/${id}/void`, {
    method: 'POST',
  });
}

export async function apiBlobRequest(
  path: string,
  options: RequestInit = {}
): Promise<Blob> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let errData: { error?: ApiError } = {};
    try {
      errData = await response.json();
    } catch {
      // Non-JSON response
    }
    const apiError: ApiError = errData.error || {
      code: `HTTP_${response.status}`,
      message: response.statusText || `Request failed with status ${response.status}`,
    };
    throw new ApiException(response.status, apiError);
  }
  return response.blob();
}

export async function downloadInvoicePdf(id: string, filename?: string): Promise<void> {
  const blob = await apiBlobRequest(`/invoices/${id}/pdf`);
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || `invoice-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}

// --- Public Invoices & Payment Types ---
export interface PublicInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface PublicInvoicePayment {
  provider: string;
  status: string;
  paidAt: string | null;
  amount: number;
}

export interface PublicInvoice {
  displayNumber: string | null;
  businessName: string;
  clientName: string;
  currency: 'ETB' | 'USD';
  status: 'sent' | 'paid' | 'void';
  issueDate: string;
  dueDate: string;
  items: PublicInvoiceItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  sentAt: string | null;
  paidAt: string | null;
  payments: PublicInvoicePayment[];
}

export interface PublicInvoiceStatus {
  status: 'sent' | 'paid' | 'void';
  currency: 'ETB' | 'USD';
  total: number;
  paidAt: string | null;
}

export interface PayPublicInvoiceInput {
  payerEmail?: string;
  payerFirstName?: string;
  payerLastName?: string;
  provider?: string;
}

export interface PayPublicInvoiceResponse {
  checkoutUrl: string;
  demoCheckoutUrl?: string;
}

export interface CompleteSimulatedPaymentResponse {
  status: string;
  webhookStatus: number;
  result: any;
}

export async function fetchPublicInvoice(token: string): Promise<{ invoice: PublicInvoice }> {
  return apiRequest<{ invoice: PublicInvoice }>(`/public/invoices/${token}`);
}

export async function fetchPublicInvoiceStatus(token: string): Promise<PublicInvoiceStatus> {
  return apiRequest<PublicInvoiceStatus>(`/public/invoices/${token}/status`);
}

export async function payPublicInvoice(
  token: string,
  data?: PayPublicInvoiceInput
): Promise<PayPublicInvoiceResponse> {
  return apiRequest<PayPublicInvoiceResponse>(`/public/invoices/${token}/pay`, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function completeSimulatedPayment(
  txRef: string
): Promise<CompleteSimulatedPaymentResponse> {
  return apiRequest<CompleteSimulatedPaymentResponse>(`/demo/simulated/${txRef}/complete`, {
    method: 'POST',
  });
}

export async function downloadPublicInvoicePdf(token: string, filename?: string): Promise<void> {
  const blob = await apiBlobRequest(`/public/invoices/${token}/pdf`);
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || `invoice-${token}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}

export interface AiDraftItem {
  description: string;
  quantity: number;
  quantityMilli: number;
  unitPrice: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface AiDraftClientSuggestion {
  id: string;
  name: string;
  email: string | null;
}

export interface AiDraftData {
  clientId: string | null;
  matchedClient: AiDraftClientSuggestion | null;
  suggestedClients: AiDraftClientSuggestion[];
  suggestedClientName: string | null;
  currency: 'ETB' | 'USD';
  issueDate: string;
  dueDate: string;
  taxRateBps: number;
  taxRatePct: number;
  notes: string;
  items: AiDraftItem[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface AiDraftResponse {
  draft: AiDraftData;
}

export async function draftInvoiceWithAi(prompt: string): Promise<AiDraftResponse> {
  return apiRequest<AiDraftResponse>('/ai/draft-invoice', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}




