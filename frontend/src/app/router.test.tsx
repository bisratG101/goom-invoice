import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../features/landing/HomePage';

describe('Frontend Skeleton', () => {
  it('renders Goom Invoice home page with health link', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText('Goom Invoice')).toBeInTheDocument();
    expect(screen.getByText(/Check API Health/i)).toBeInTheDocument();
  });
});
