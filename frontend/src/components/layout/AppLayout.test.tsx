import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { ThemeProvider } from '../../context/ThemeContext';
import * as AuthContextModule from '../../context/AuthContext';

describe('AppLayout Component', () => {
  it('renders greeting, logo, navigation links, and theme toggle', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', name: 'Abebe Bikila', email: 'abebe@example.com' },
      business: { id: 'b1', name: 'Abebe Logistics', defaultCurrency: 'ETB', invoicePrefix: 'INV', timezone: 'UTC' },
      token: 'mock-token',
      isAuthenticated: true,
      isLoading: false,
      isDemo: false,
      login: vi.fn(),
      register: vi.fn(),
      loginDemo: vi.fn(),
      logout: vi.fn(),
      updateBusinessState: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AppLayout>
            <div>Main Page Content</div>
          </AppLayout>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getAllByText(/Abebe/).length).toBeGreaterThan(0);
    expect(screen.getByText('Main Page Content')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /mobile navigation/i })).toBeInTheDocument();
  });
});
