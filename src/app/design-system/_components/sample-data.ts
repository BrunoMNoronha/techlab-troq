import type { Tone } from '@/components/ui';

// Dados fictícios das páginas-modelo. Nenhuma relação com o domínio do TROQS.

export interface SampleRecord {
  id: string;
  name: string;
  owner: string;
  status: 'active' | 'pending' | 'archived';
  updatedAt: string;
  amount: string;
}

export const STATUS: Record<SampleRecord['status'], { label: string; tone: Tone }> = {
  active: { label: 'Ativo', tone: 'success' },
  pending: { label: 'Pendente', tone: 'warning' },
  archived: { label: 'Arquivado', tone: 'neutral' },
};

export const RECORDS: readonly SampleRecord[] = [
  {
    id: 'REG-0042',
    name: 'Contrato de fornecimento anual',
    owner: 'Ana Lima',
    status: 'active',
    updatedAt: '02/10/2026',
    amount: 'R$ 12.400,00',
  },
  {
    id: 'REG-0041',
    name: 'Renovação de licenças',
    owner: 'Bruno Souza',
    status: 'pending',
    updatedAt: '30/09/2026',
    amount: 'R$ 3.150,00',
  },
  {
    id: 'REG-0040',
    name: 'Projeto piloto com nome bastante longo para testar a quebra de linha no celular',
    owner: 'Carla Menezes',
    status: 'active',
    updatedAt: '28/09/2026',
    amount: 'R$ 980,00',
  },
  {
    id: 'REG-0039',
    name: 'Auditoria trimestral',
    owner: 'Diego Prado',
    status: 'archived',
    updatedAt: '15/09/2026',
    amount: 'R$ 0,00',
  },
];

export const ACTIVITY = [
  { id: 'a1', title: 'REG-0042 foi aprovado', description: 'Ana Lima · há 2 horas' },
  { id: 'a2', title: 'Novo comentário em REG-0041', description: 'Bruno Souza · há 5 horas' },
  { id: 'a3', title: 'REG-0039 foi arquivado', description: 'Diego Prado · ontem' },
] as const;
