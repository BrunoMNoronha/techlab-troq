import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-display';
import { Alert, EmptyState, ErrorState } from './feedback';
import { describedBy, Field, Input } from './forms';
import { PageHeader, Section } from './layout';
import { Pagination, Stepper } from './navigation';

describe('Field', () => {
  it('liga rótulo, descrição e erro ao controle pelos ids padrão', () => {
    render(
      <Field label="Cidade" htmlFor="city" hint="Aparece no anúncio." error="Informe a cidade.">
        <Input id="city" aria-invalid aria-describedby={describedBy('city-hint', 'city-error')} />
      </Field>,
    );

    const input = screen.getByLabelText('Cidade');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Aparece no anúncio. Informe a cidade.');
  });

  it('o marcador de obrigatório não altera o texto do rótulo', () => {
    render(
      <Field label="Nome" htmlFor="name" required>
        <Input id="name" required />
      </Field>,
    );

    expect(screen.getByLabelText('Nome')).toBeRequired();
  });

  it('describedBy ignora ids ausentes', () => {
    expect(describedBy(undefined, false, 'a', null, 'b')).toBe('a b');
    expect(describedBy(undefined, false)).toBeUndefined();
  });
});

describe('Alert e estados', () => {
  it('Alert repassa o papel e nomeia a região pelo título quando pedido', () => {
    render(
      <Alert
        as="section"
        role="status"
        aria-label="Pagamento confirmado"
        title="Pagamento confirmado"
        titleAs="h2"
      >
        Agora o anunciante escolhe.
      </Alert>,
    );

    const region = screen.getByRole('status', { name: 'Pagamento confirmado' });
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Pagamento confirmado',
    );
  });

  it('ErrorState é anunciado como alerta e EmptyState não', () => {
    render(
      <>
        <ErrorState title="Falhou" description="Tente de novo." />
        <EmptyState title="Vazio" />
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Vazio');
  });
});

describe('PageHeader e Section', () => {
  it('PageHeader renderiza o h1 da página', () => {
    render(<PageHeader title="Meus anúncios" description="Só você vê esta página." />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Meus anúncios');
  });

  it('Section com titleId vira região nomeada pelo título', () => {
    render(
      <Section title="Histórico" titleId="historico">
        conteúdo
      </Section>,
    );

    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent('conteúdo');
  });
});

describe('Stepper', () => {
  it('marca a etapa atual e as concluídas sem depender de cor', () => {
    render(<Stepper label="Etapas" steps={['Dados', 'Revisão', 'Fim']} current={2} />);

    const items = within(screen.getByRole('list', { name: 'Etapas' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Dados (concluída)');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).not.toHaveAttribute('aria-current');
  });
});

describe('Pagination', () => {
  it('não renderiza nada sem página anterior nem seguinte', () => {
    const { container } = render(<Pagination />);

    expect(container).toBeEmptyDOMElement();
  });

  it('expõe os links dentro de um nav nomeado', () => {
    render(<Pagination previous={{ href: '/?p=1' }} next={{ href: '/?p=3' }} status="Página 2" />);

    const nav = screen.getByRole('navigation', { name: 'Paginação' });
    expect(within(nav).getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', '/?p=1');
    expect(within(nav).getByRole('link', { name: 'Próxima' })).toHaveAttribute('href', '/?p=3');
  });
});

describe('DataTable', () => {
  it('mantém a semântica de tabela e rotula cada célula para o cartão do celular', () => {
    render(
      <DataTable
        caption="Registros"
        rows={[{ id: '1', name: 'Contrato', status: 'Ativo' }]}
        rowKey={(row) => row.id}
        columns={[
          { key: 'name', header: 'Registro', role: 'primary', cell: (row) => row.name },
          { key: 'status', header: 'Situação', cell: (row) => row.status },
        ]}
      />,
    );

    const table = screen.getByRole('table', { name: 'Registros' });
    expect(within(table).getByRole('rowheader')).toHaveTextContent('Contrato');
    const cell = within(table).getByRole('cell');
    expect(cell).toHaveTextContent('Ativo');
    expect(cell).toHaveAttribute('data-label', 'Situação');
  });
});
