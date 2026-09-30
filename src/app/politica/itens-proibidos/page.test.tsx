import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PoliticaItensProibidosPage from './page';

// A pagina e superficie derivada de prohibited-items.md (secao 5, item 2) e nao
// pode contradize-lo. Este teste le o documento normativo e exige que cada
// titulo e fundamento exibido exista LITERALMENTE nele: mudou a politica sem
// atualizar a pagina (ou o contrario), a suite quebra.
const policy = readFileSync(join(process.cwd(), 'docs/product/prohibited-items.md'), 'utf-8');

function docCategories(): { heading: string; fundamento: string }[] {
  const out: { heading: string; fundamento: string }[] = [];
  let heading = '';
  for (const line of policy.split('\n')) {
    const h = line.match(/^#### (PI-\d{2}) — (.+)$/);
    if (h) heading = `${h[1]} — ${h[2]}`;
    const f = line.match(/^- \*\*Fundamento:\*\* (.+)$/);
    if (f && heading) {
      out.push({ heading, fundamento: f[1].replace(/`/g, '') });
      heading = '';
    }
  }
  return out;
}

describe('/politica/itens-proibidos', () => {
  it('exibe as 12 categorias do documento, com titulo e fundamento literais', () => {
    render(<PoliticaItensProibidosPage />);
    const expected = docCategories();
    expect(expected).toHaveLength(12);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(expected.length);
    expected.forEach(({ heading, fundamento }, i) => {
      const item = within(items[i]);
      expect(item.getByRole('heading', { level: 3 })).toHaveTextContent(heading);
      expect(items[i]).toHaveTextContent(`Fundamento: ${fundamento}`);
    });
  });

  it('preserva a leitura dos tres fundamentos (secao 3.1) e aponta para o texto completo', () => {
    render(<PoliticaItensProibidosPage />);
    for (const reading of [
      'Isto é proibido por lei',
      'Isto pode ser lícito no Brasil, mas o TROQ não tem como verificar as condições, então não aceita',
      'O TROQ escolheu não aceitar',
    ]) {
      expect(policy).toContain(reading);
      expect(screen.getByText(new RegExp(reading))).toBeInTheDocument();
    }
    expect(
      screen.getByRole('link', { name: 'documento da Política de itens proibidos' }),
    ).toHaveAttribute('href', expect.stringContaining('docs/product/prohibited-items.md'));
  });
});
