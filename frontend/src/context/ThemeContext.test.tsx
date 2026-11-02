import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from './ThemeContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';

describe('ThemeContext and ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('toggles theme between light and dark and updates localStorage', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByRole('button', { name: /switch to dark theme/i });
    expect(toggleBtn).toBeInTheDocument();

    // Click to toggle to dark
    fireEvent.click(toggleBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    // Click again to toggle back to light
    const toggleToLightBtn = screen.getByRole('button', { name: /switch to light theme/i });
    fireEvent.click(toggleToLightBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
