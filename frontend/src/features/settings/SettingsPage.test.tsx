import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsPage } from './SettingsPage';
import { ThemeProvider } from '../../context/ThemeContext';
import * as AuthContextModule from '../../context/AuthContext';
import * as api from '../../lib/api';

describe('Prompt 14: Settings (/app/settings)', () => {
  let queryClient: QueryClient;
  const mockUpdateBusinessState = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', name: 'Haile Gebrselassie', email: 'haile@example.com' },
      business: {
        id: 'b1',
        name: 'Haile Resorts PLC',
        defaultCurrency: 'ETB',
        invoicePrefix: 'HRL',
        timezone: 'Africa/Addis_Ababa',
      },
      token: 'mock-token',
      isAuthenticated: true,
      isLoading: false,
      isDemo: false,
      login: vi.fn(),
      register: vi.fn(),
      loginDemo: vi.fn(),
      logout: vi.fn(),
      updateBusinessState: mockUpdateBusinessState,
    });
  });

  const renderSettings = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/app/settings']}>
            <SettingsPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  it('renders business settings form with current values', async () => {
    vi.spyOn(api, 'fetchBusiness').mockResolvedValue({
      business: {
        id: 'b1',
        name: 'Haile Resorts PLC',
        defaultCurrency: 'ETB',
        invoicePrefix: 'HRL',
        timezone: 'Africa/Addis_Ababa',
        createdAt: new Date().toISOString(),
      },
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByLabelText(/business name/i)).toHaveValue('Haile Resorts PLC');
      expect(screen.getByLabelText(/default currency/i)).toHaveValue('ETB');
      expect(screen.getByLabelText(/invoice prefix/i)).toHaveValue('HRL');
      expect(screen.getByLabelText(/business timezone/i)).toHaveValue('Africa/Addis_Ababa');
      // Live preview
      expect(screen.getByText('HRL-0001')).toBeInTheDocument();
    });
  });

  it('validates prefix format (1 to 8 uppercase alphanumeric chars)', async () => {
    vi.spyOn(api, 'fetchBusiness').mockResolvedValue({
      business: {
        id: 'b1',
        name: 'Haile Resorts PLC',
        defaultCurrency: 'ETB',
        invoicePrefix: 'HRL',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    renderSettings();

    const prefixInput = await screen.findByLabelText(/invoice prefix/i);
    fireEvent.change(prefixInput, { target: { value: 'TOOLONGPREFIX' } });

    const submitBtn = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/prefix must be 1 to 8 uppercase alphanumeric characters/i)).toBeInTheDocument();
    });
  });

  it('saves settings with valid data and updates auth state', async () => {
    vi.spyOn(api, 'fetchBusiness').mockResolvedValue({
      business: {
        id: 'b1',
        name: 'Haile Resorts PLC',
        defaultCurrency: 'ETB',
        invoicePrefix: 'HRL',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    const updateSpy = vi.spyOn(api, 'updateBusiness').mockResolvedValue({
      business: {
        id: 'b1',
        name: 'Haile Hospitality Group',
        defaultCurrency: 'USD',
        invoicePrefix: 'HHG',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    renderSettings();

    const nameInput = await screen.findByLabelText(/business name/i);
    fireEvent.change(nameInput, { target: { value: 'Haile Hospitality Group' } });

    const currencyInput = screen.getByLabelText(/default currency/i);
    fireEvent.change(currencyInput, { target: { value: 'USD' } });

    const prefixInput = screen.getByLabelText(/invoice prefix/i);
    fireEvent.change(prefixInput, { target: { value: 'HHG' } });

    const submitBtn = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        name: 'Haile Hospitality Group',
        default_currency: 'USD',
        invoice_prefix: 'HHG',
        timezone: 'Africa/Addis_Ababa',
      });
      expect(mockUpdateBusinessState).toHaveBeenCalledWith({
        id: 'b1',
        name: 'Haile Hospitality Group',
        defaultCurrency: 'USD',
        invoicePrefix: 'HHG',
        timezone: 'Africa/Addis_Ababa',
      });
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });
  });

  it('displays API error alert when settings save fails', async () => {
    vi.spyOn(api, 'fetchBusiness').mockResolvedValue({
      business: {
        id: 'b1',
        name: 'Haile Resorts PLC',
        defaultCurrency: 'ETB',
        invoicePrefix: 'HRL',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    vi.spyOn(api, 'updateBusiness').mockRejectedValue(
      new api.ApiException(422, { code: 'VALIDATION_ERROR', message: 'Invoice prefix is already registered' })
    );

    renderSettings();

    const nameInput = await screen.findByLabelText(/business name/i);
    fireEvent.change(nameInput, { target: { value: 'New Name' } });

    const submitBtn = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invoice prefix is already registered');
    });
  });

  it('restores last loaded values when clicking Reset Changes button', async () => {
    vi.spyOn(api, 'fetchBusiness').mockResolvedValue({
      business: {
        id: 'b1',
        name: 'Haile Resorts PLC',
        defaultCurrency: 'ETB',
        invoicePrefix: 'HRL',
        timezone: 'Africa/Addis_Ababa',
      },
    });

    renderSettings();

    const nameInput = await screen.findByLabelText(/business name/i);
    expect(nameInput).toHaveValue('Haile Resorts PLC');

    // Change input
    fireEvent.change(nameInput, { target: { value: 'Modified Business Name' } });
    expect(nameInput).toHaveValue('Modified Business Name');

    const resetBtn = screen.getByRole('button', { name: /reset changes/i });
    expect(resetBtn).not.toBeDisabled();

    fireEvent.click(resetBtn);

    // Reverts back to initial loaded business name
    await waitFor(() => {
      expect(nameInput).toHaveValue('Haile Resorts PLC');
    });
  });
});
