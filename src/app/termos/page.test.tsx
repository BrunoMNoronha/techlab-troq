import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TERMS_VERSION } from '@/modules/identity/terms';
import { TermsConsentText } from '../_components/terms-consent';
import TermosPage from './page';

describe('TermosPage', () => {
  it('publica a mesma versão gravada no aceite do cadastro', () => {
    render(<TermosPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Termos de Uso');
    expect(screen.getByText(`Versão ${TERMS_VERSION}`)).toBeInTheDocument();
  });

  it('expõe as regras da solicitação paga e do reembolso técnico', () => {
    render(<TermosPage />);

    const paid = screen.getByRole('region', { name: /Interesse e solicitação paga/ });
    expect(paid).toHaveTextContent('R$ 0,99');
    expect(paid).toHaveTextContent(/três solicitações pagas/);
    expect(paid).toHaveTextContent(/Pagar não garante ser escolhido/);
    expect(screen.getByRole('region', { name: /Reembolso técnico/ })).toHaveTextContent(
      /duplicidade/,
    );
  });

  it('declara que o TROQS não é parte da troca e liga às políticas', () => {
    render(<TermosPage />);

    expect(screen.getByRole('region', { name: /O que é o TROQS/ })).toHaveTextContent(
      /não é parte da troca/,
    );
    const article = screen.getByRole('article');
    expect(
      within(article).getByRole('link', { name: 'Política de itens proibidos' }),
    ).toHaveAttribute('href', '/politica/itens-proibidos');
    expect(
      within(article).getAllByRole('link', { name: 'Política de Privacidade' })[0],
    ).toHaveAttribute('href', '/privacidade');
  });
});

describe('TermsConsentText', () => {
  it('leva aos termos e à política em nova aba, sem perder o formulário', () => {
    render(<TermsConsentText />);

    for (const [name, href] of [
      ['Termos de Uso', '/termos'],
      ['Política de Privacidade', '/privacidade'],
    ]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
