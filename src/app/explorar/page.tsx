import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Field, Filters, Input, Select } from '@/components/forms';
import { PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { Button, TextLink } from '@/components/ui';
import { BRAZILIAN_UFS, isBrazilianUf, ufOptionLabel } from '@/modules/listing/uf';
import { ExplorarLoading, ExplorarResults } from './explorar-results';
import {
  explorarHref,
  hasFilter,
  readExplorarQuery,
  type ExplorarSearchParams,
} from './explorar-query';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ofertas — TROQ',
  description: 'Ofertas publicadas no TROQ, abertas sem login.',
};

export default async function ExplorarPage({
  searchParams,
}: {
  searchParams: Promise<ExplorarSearchParams>;
}) {
  const query = readExplorarQuery(await searchParams);
  const filtered = hasFilter(query);

  return (
    <PageContainer width="wide">
      <PageHeader title="Anúncios no TROQ" />

      <Stack gap={6}>
        {/* Filtro por GET: a URL e a fonte de verdade, e a pagina volta a 1. */}
        <Filters method="get" action="/explorar" role="search" aria-label="Filtrar por localização">
          <Field label="Cidade" htmlFor="filtro-cidade">
            <Input
              id="filtro-cidade"
              name="city"
              type="text"
              defaultValue={query.city}
              autoComplete="address-level2"
              maxLength={120}
            />
          </Field>
          <Field label="UF" htmlFor="filtro-uf">
            {/* A chave remonta o seletor quando a URL muda, para o valor acompanhar. */}
            <Select
              key={query.state}
              id="filtro-uf"
              name="state"
              defaultValue={query.state}
              autoComplete="address-level1"
            >
              <option value="">Todos os estados</option>
              {/* Sigla inexistente vinda da URL continua filtrando (resultado vazio) e
                  aparece como tal, em vez de "Todos os estados" ou outra UF. */}
              {query.state !== '' && !isBrazilianUf(query.state) && (
                <option value={query.state}>UF inválida ({query.state})</option>
              )}
              {BRAZILIAN_UFS.map((uf) => (
                <option key={uf.code} value={uf.code}>
                  {ufOptionLabel(uf)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" iconStart="filter">
            Filtrar
          </Button>
          {filtered && (
            <TextLink href={explorarHref({ page: 1, city: '', state: '' })} touch>
              Limpar filtro
            </TextLink>
          )}
        </Filters>

        <Section aria-label="Resultados">
          {/* A chave refaz o fallback a cada navegacao entre paginas/filtros. */}
          <Suspense key={explorarHref(query)} fallback={<ExplorarLoading />}>
            <ExplorarResults query={query} />
          </Suspense>
        </Section>
      </Stack>
    </PageContainer>
  );
}
