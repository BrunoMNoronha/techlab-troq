import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, ButtonLink, IconButton } from './button';

describe('Button', () => {
  it('é type="button" por padrão e aplica a variante como classe', () => {
    render(<Button variant="danger">Excluir</Button>);
    const button = screen.getByRole('button', { name: 'Excluir' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('danger');
  });

  it('em loading fica desabilitado e ocupado, mantendo o texto do chamador', () => {
    render(<Button loading>Salvando...</Button>);
    const button = screen.getByRole('button', { name: 'Salvando...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('ButtonLink navega por link, com ou sem recarga', () => {
    render(
      <>
        <ButtonLink href="/a">A</ButtonLink>
        <ButtonLink href="/b" reload>
          B
        </ButtonLink>
      </>,
    );
    expect(screen.getByRole('link', { name: 'A' })).toHaveAttribute('href', '/a');
    expect(screen.getByRole('link', { name: 'B' })).toHaveAttribute('href', '/b');
  });

  it('IconButton exige e expõe o nome acessível', () => {
    render(<IconButton icon="x" label="Fechar" />);
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });
});
