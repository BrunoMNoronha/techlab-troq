import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage', () => {
  it('anuncia o produto no cabeçalho principal', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'TechLab+ TROQ' })).toBeInTheDocument();
  });

  it('informa que a fundação técnica está operacional', () => {
    render(<HomePage />);

    expect(screen.getByText(/fundação técnica operacional/i)).toBeInTheDocument();
  });
});
