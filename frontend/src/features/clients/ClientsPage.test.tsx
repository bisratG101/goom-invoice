import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientsPage } from './ClientsPage';
import { ThemeProvider } from '../../context/ThemeContext';
import * as api from '../../lib/api';

describe('Prompt 14: Clients (/app/clients)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  const renderClients = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/app/clients']}>
            <ClientsPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  it('renders clients list with active clients', async () => {
    vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [
        {
          id: 'c1',
          businessId: 'b1',
          name: 'Habesha Tech Solutions',
          email: 'contact@habeshatech.et',
          phone: '+251 91 122 3344',
          address: 'Bole Medhanialem, Addis Ababa',
          archivedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderClients();

    await waitFor(() => {
      expect(screen.getAllByText('Habesha Tech Solutions').length).toBeGreaterThan(0);
      expect(screen.getAllByText('contact@habeshatech.et').length).toBeGreaterThan(0);
      expect(screen.getAllByText('+251 91 122 3344').length).toBeGreaterThan(0);
    });
  });

  it('filters clients on search input', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });

    renderClients();

    const searchInput = screen.getByPlaceholderText(/search by name or email/i);
    fireEvent.change(searchInput, { target: { value: 'Bole' } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Bole' })
      );
    });
  });

  it('opens drawer and validates required name field when creating client', async () => {
    vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });

    renderClients();

    const addBtn = screen.getAllByRole('button', { name: /add client/i })[0];
    fireEvent.click(addBtn);

    expect(screen.getByText('Add New Client')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /create client/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/client name is required/i)).toBeInTheDocument();
    });
  });

  it('submits valid client data and closes drawer', async () => {
    vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });

    const createSpy = vi.spyOn(api, 'createClient').mockResolvedValue({
      client: {
        id: 'c2',
        businessId: 'b1',
        name: 'Addis Trading Co',
        email: 'billing@addistrading.com',
        phone: null,
        address: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
      },
    });

    renderClients();

    const addBtn = screen.getAllByRole('button', { name: /add client/i })[0];
    fireEvent.click(addBtn);

    fireEvent.change(screen.getByRole('textbox', { name: /client name/i }), {
      target: { value: 'Addis Trading Co' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'billing@addistrading.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create client/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Addis Trading Co',
        email: 'billing@addistrading.com',
        phone: null,
        address: null,
      });
      expect(screen.queryByText('Add New Client')).not.toBeInTheDocument();
    });
  });

  it('opens confirmation modal and archives client', async () => {
    vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [
        {
          id: 'c3',
          businessId: 'b1',
          name: 'Nile Exporting Ltd',
          email: null,
          phone: null,
          address: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    const archiveSpy = vi.spyOn(api, 'archiveClient').mockResolvedValue();

    renderClients();

    await waitFor(() => {
      expect(screen.getAllByText('Nile Exporting Ltd').length).toBeGreaterThan(0);
    });

    const archiveBtn = screen.getAllByRole('button', { name: /archive/i })[0];
    fireEvent.click(archiveBtn);

    // Confirm dialog appears
    expect(screen.getByText(/Archive Nile Exporting Ltd/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /archive client/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(archiveSpy).toHaveBeenCalledWith('c3');
    });
  });

  it('opens drawer with existing client details and submits update', async () => {
    vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [
        {
          id: 'c4',
          businessId: 'b1',
          name: 'Original Client Name',
          email: 'old@example.com',
          phone: '+251 90 000 0000',
          address: 'Old Address',
          archivedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    const updateSpy = vi.spyOn(api, 'updateClient').mockResolvedValue({
      client: {
        id: 'c4',
        businessId: 'b1',
        name: 'Updated Client Name',
        email: 'new@example.com',
        phone: null,
        address: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
      },
    });

    renderClients();

    await waitFor(() => {
      expect(screen.getAllByText('Original Client Name').length).toBeGreaterThan(0);
    });

    const editBtn = screen.getAllByRole('button', { name: /edit/i })[0];
    fireEvent.click(editBtn);

    expect(screen.getByText('Edit Original Client Name')).toBeInTheDocument();

    const nameInput = screen.getByRole('textbox', { name: /client name/i });
    fireEvent.change(nameInput, { target: { value: 'Updated Client Name' } });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('c4', expect.objectContaining({
        name: 'Updated Client Name',
      }));
    });
  });

  it('switches to archived tab and allows restoring client', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [
        {
          id: 'c5',
          businessId: 'b1',
          name: 'Archived Client',
          email: null,
          phone: null,
          address: null,
          archivedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    const unarchiveSpy = vi.spyOn(api, 'unarchiveClient').mockResolvedValue({
      client: {
        id: 'c5',
        businessId: 'b1',
        name: 'Archived Client',
        email: null,
        phone: null,
        address: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
      },
    });

    renderClients();

    const archivedTab = screen.getByRole('tab', { name: 'Archived' });
    fireEvent.click(archivedTab);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ archived: 'true' })
      );
      expect(screen.getAllByText('Archived Client').length).toBeGreaterThan(0);
    });

    const restoreBtn = screen.getAllByRole('button', { name: /restore/i })[0];
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(unarchiveSpy).toHaveBeenCalledWith('c5');
    });
  });

  it('debounces search by 300ms: does not query immediately, queries after 300ms, resets on new typing', async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.spyOn(api, 'fetchClients').mockResolvedValue({
        clients: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      renderClients();
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Initial load

      const searchInput = screen.getByPlaceholderText(/search by name or email/i);

      // Type "A"
      fireEvent.change(searchInput, { target: { value: 'A' } });
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Not called immediately

      // Advance 150ms
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Still not called

      // Type "Addis" (resets debounce timer)
      fireEvent.change(searchInput, { target: { value: 'Addis' } });

      // Advance 150ms (300ms from start, but only 150ms since last keystroke)
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Still waiting for the new 300ms timer!

      // Advance remaining 150ms (total 300ms of inactivity)
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Addis' }));

      // Clear search button
      const clearBtn = screen.getByLabelText(/clear search/i);
      fireEvent.click(clearBtn);
      expect(searchInput).toHaveValue('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles pagination navigation and boundaries', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [
        {
          id: 'c-page-1',
          businessId: 'b1',
          name: 'Page 1 Client',
          email: null,
          phone: null,
          address: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
    });

    renderClients();

    await waitFor(() => {
      expect(screen.getAllByText('Page 1 Client').length).toBeGreaterThan(0);
      expect(screen.getByText(/Showing page/i)).toHaveTextContent('Showing page 1 of 3');
      expect(screen.getByText(/45 clients total/i)).toBeInTheDocument();
    });

    // Boundary: Previous is disabled on page 1
    const prevBtn = screen.getByRole('button', { name: /previous page/i });
    const nextBtn = screen.getByRole('button', { name: /next page/i });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Navigate to Page 2
    fetchSpy.mockResolvedValueOnce({
      clients: [
        {
          id: 'c-page-2',
          businessId: 'b1',
          name: 'Page 2 Client',
          email: null,
          phone: null,
          address: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 2, limit: 20, total: 45, totalPages: 3 },
    });

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
      expect(screen.getAllByText('Page 2 Client').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /previous page/i })).not.toBeDisabled();
    });
  });

  it('resets pagination to page 1 when tab changes without firing intermediate page-3 query', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchClients').mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      return {
        clients: [
          {
            id: `c-p-${page}`,
            businessId: 'b1',
            name: `Page ${page} Client`,
            email: null,
            phone: null,
            address: null,
            archivedAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: { page, limit: 20, total: 60, totalPages: 3 },
      };
    });

    renderClients();

    await waitFor(() => {
      expect(screen.getAllByText('Page 1 Client').length).toBeGreaterThan(0);
    });

    // Advance to page 2 then page 3
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Page 2 Client').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Page 3 Client').length).toBeGreaterThan(0);
    });

    // Clear spy history to track calls strictly after being on page 3
    fetchSpy.mockClear();

    // Click Archived tab while on page 3
    const archivedTab = screen.getByRole('tab', { name: 'Archived' });
    fireEvent.click(archivedTab);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, archived: 'true' })
      );
    });

    // Verify that NO intermediate request was made with page > 1 and archived: 'true'
    const invalidCalls = fetchSpy.mock.calls.filter(
      ([params]) => (params?.page ?? 1) > 1 && params?.archived === 'true'
    );
    expect(invalidCalls.length).toBe(0);
  });

  it('resets pagination to page 1 on debounced search without firing intermediate page-3 query', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchClients').mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      return {
        clients: [
          {
            id: `c-p-${page}`,
            businessId: 'b1',
            name: `Page ${page} Client`,
            email: null,
            phone: null,
            address: null,
            archivedAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: { page, limit: 20, total: 60, totalPages: 3 },
      };
    });

    renderClients();

    await waitFor(() => {
      expect(screen.getAllByText('Page 1 Client').length).toBeGreaterThan(0);
    });

    // Advance to page 2
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Page 2 Client').length).toBeGreaterThan(0);
    });

    // Advance to page 3
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => {
      expect(screen.getAllByText('Page 3 Client').length).toBeGreaterThan(0);
    });

    // Switch to fake timers to test debounced search while on page 3
    vi.useFakeTimers();
    try {
      fetchSpy.mockClear();

      // Type a new search term while on page 3
      const searchInput = screen.getByPlaceholderText(/search by name or email/i);
      act(() => {
        fireEvent.change(searchInput, { target: { value: 'Entoto' } });
      });

      // Before 300ms, no search query is sent
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(fetchSpy).not.toHaveBeenCalled();

      // After 300ms, query is dispatched with page 1, NEVER with page 3
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, search: 'Entoto' })
      );

      // Verify no intermediate request was made with page > 1 and search: 'Entoto'
      const intermediateCalls = fetchSpy.mock.calls.filter(
        ([params]) => params?.search === 'Entoto' && (params?.page ?? 1) > 1
      );
      expect(intermediateCalls.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('displays API error inside drawer on create failure', async () => {
    vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    vi.spyOn(api, 'createClient').mockRejectedValue(
      new api.ApiException(422, { code: 'VALIDATION_ERROR', message: 'A client with this email already exists' })
    );

    renderClients();

    const addBtn = screen.getAllByRole('button', { name: /add client/i })[0];
    fireEvent.click(addBtn);

    fireEvent.change(screen.getByRole('textbox', { name: /client name/i }), {
      target: { value: 'Duplicate Client' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create client/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A client with this email already exists');
    });
  });

  it('displays error alert banner and retries when client list fetch fails', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchClients').mockRejectedValueOnce(new Error('Network failure'));

    renderClients();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load clients/i);
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    // Now mock success for retry
    fetchSpy.mockResolvedValueOnce({
      clients: [
        {
          id: 'c-recovered',
          businessId: 'b1',
          name: 'Recovered Client',
          email: null,
          phone: null,
          address: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Recovered Client').length).toBeGreaterThan(0);
    });
  });
});
