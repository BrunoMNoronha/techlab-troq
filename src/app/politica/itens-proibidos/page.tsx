import type { Metadata } from 'next';
import { DescriptionList } from '@/components/data-display';
import { PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { Card, Heading, Text, TextLink } from '@/components/ui';

// Politica de itens proibidos acessivel a partir da publicacao (F2-010, #48;
// prohibited-items.md, secao 5, item 2). Todo texto abaixo e copiado LITERALMENTE
// das secoes 3.1 e 3.2 de docs/product/prohibited-items.md (DEC-031): titulos das
// categorias, fundamento de cada uma e a leitura correta de cada fundamento, que
// a secao 3.1 obriga a preservar em qualquer superficie derivada. Nada aqui cria,
// resume ou interpreta regra; o texto normativo completo segue no link ao final.
// Mudou a politica? Atualize esta pagina e LISTING_COMPLIANCE_TERMS_VERSION juntos.

export const metadata: Metadata = {
  title: 'Política de itens proibidos — TROQS',
};

const POLICY_SOURCE_URL =
  'https://github.com/BrunoMNoronha/techlab-troq/blob/main/docs/product/prohibited-items.md';

const FUNDAMENTOS = [
  {
    code: 'ilegal',
    meaning:
      'A conduta de vender, oferecer ou expor à venda é vedada por legislação, conforme fonte registrada na seção 16',
    reading: '"Isto é proibido por lei"',
  },
  {
    code: 'regulado',
    meaning:
      'A comercialização é lícita apenas sob licença, autorização, registro, prescrição ou controle equivalente, incompatível com um marketplace C2C sem verificação; bloqueado no TROQS pela decisão da seção 2',
    reading:
      '"Isto pode ser lícito no Brasil, mas o TROQS não tem como verificar as condições, então não aceita"',
  },
  {
    code: 'política',
    meaning:
      'Não há vedação legal clara aplicável, mas o risco jurídico, sanitário, de segurança ou operacional é desproporcional para o MVP',
    reading: '"O TROQS escolheu não aceitar"',
  },
] as const;

const CATEGORIES = [
  ['PI-01', 'Itens cuja comercialização é ilegal', '`ilegal`.'],
  ['PI-02', 'Bens de origem ilícita ou razoavelmente suspeita', '`ilegal`.'],
  [
    'PI-03',
    'Armas de fogo, munições, explosivos, acessórios e simulacros',
    '`ilegal` para a transferência entre particulares sem autorização e para simulacros que se confundam com arma de fogo; `regulado` para o restante.',
  ],
  ['PI-04', 'Drogas, entorpecentes e substâncias controladas', '`ilegal`.'],
  ['PI-05', 'Medicamentos e produtos sujeitos à vigilância sanitária', '`regulado`.'],
  [
    'PI-06',
    'Tabaco, dispositivos eletrônicos para fumar e correlatos',
    '`ilegal` para dispositivos eletrônicos para fumar, cuja fabricação, importação, comercialização, distribuição, armazenamento, transporte e propaganda são proibidos no Brasil; `regulado` e `política` para os demais produtos de tabaco, que dependem de controle etário e de regime tributário específico.',
  ],
  [
    'PI-07',
    'Bebidas alcoólicas e outros itens sob controle etário',
    '`regulado`, combinado com a decisão da seção 2.',
  ],
  [
    'PI-08',
    'Fauna, flora, partes de animais e produtos de origem biológica controlada',
    '`ilegal` quando não houver origem autorizada; `regulado` no restante, porque a comercialização lícita exige criadouro ou empreendimento licenciado, marcação individual e documentação de origem.',
  ],
  ['PI-09', 'Substâncias e materiais perigosos', '`regulado` e `política`.'],
  ['PI-10', 'Falsificações e violações de propriedade intelectual', '`ilegal`.'],
  [
    'PI-11',
    'Serviços, bens imateriais e itens fora da natureza do TROQS',
    '`política`, com componente `regulado` nas linhas financeiras e de apostas.',
  ],
  [
    'PI-12',
    'Conteúdo e conduta do anúncio',
    '`ilegal` nas linhas criminais; `política` nas demais.',
  ],
] as const;

/** Mostra os termos entre crases como codigo, como no documento de origem. */
function withCode(text: string) {
  return text
    .split(/(`[^`]+`)/)
    .map((part, i) =>
      part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
    );
}

export default function PoliticaItensProibidosPage() {
  return (
    <PageContainer width="content">
      <PageHeader
        title="Política de itens proibidos"
        description={
          <>
            Ao publicar, o anunciante declara que o item anunciado não pertence a nenhuma das
            categorias abaixo. Os títulos e fundamentos desta página são reproduzidos do documento
            normativo da política; o texto completo, com definições, exemplos e casos limítrofes,
            está no{' '}
            <TextLink href={POLICY_SOURCE_URL} reload>
              documento da Política de itens proibidos
            </TextLink>
            .
          </>
        }
      />

      <Stack gap={8}>
        <Section title="Como ler o catálogo">
          <Text tone="muted">
            Cada categoria registra um <strong>fundamento</strong>, classificado em um de três
            tipos.
          </Text>
          <DescriptionList
            items={FUNDAMENTOS.map((f) => ({
              term: f.code,
              detail: `${f.meaning}. Leitura correta: ${f.reading}.`,
            }))}
          />
          <Text tone="muted">
            Os exemplos são <strong>não exaustivos</strong> e ilustram a categoria; não constituem a
            definição.
          </Text>
        </Section>

        <Section title="Categorias">
          <Stack as="ol" gap={3}>
            {CATEGORIES.map(([code, title, fundamento]) => (
              <Card as="li" key={code}>
                <Stack gap={1}>
                  <Heading level={3} size="h4">
                    {code} — {title}
                  </Heading>
                  <Text size="small" tone="muted">
                    <strong>Fundamento:</strong> {withCode(fundamento)}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        </Section>
      </Stack>
    </PageContainer>
  );
}
