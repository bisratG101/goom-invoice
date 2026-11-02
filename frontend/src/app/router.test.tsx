import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../features/landing/HomePage';

describe('Landing Page', () => {
  it('renders landing page with headline, nav, and CTAs', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Get paid faster\. Invoice in seconds, collect in ETB or USD\./i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create free account/i })).toBeInTheDocument();
    expect(screen.getByText(/Portfolio project\. Payments run in test mode\./i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Features/i })).toBeInTheDocument();
  });
});
