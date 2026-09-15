import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Por que `APP_ENV` aparece aqui (F1-010).
  //
  // `environment` e enviado explicitamente a partir de `APP_ENV`, e de mais
  // nenhuma variavel (ADR-0007, decisao 11: nao existe `SENTRY_ENVIRONMENT`
  // nem `NEXT_PUBLIC_SENTRY_ENVIRONMENT`). Mas `instrumentation-client.ts` roda
  // no navegador, e o Next.js so embute no bundle de cliente as variaveis com
  // prefixo `NEXT_PUBLIC_`. Rotular corretamente o evento de browser e, ao
  // mesmo tempo, nao duplicar a variavel exige exatamente isto: derivar o valor
  // da UNICA fonte de verdade, no build, sem criar um segundo nome.
  //
  // O valor e um rotulo de tres literais — `development`, `preview`,
  // `production` —, nao e segredo (environments.md, secoes 3.3 e 5.1) e nao
  // autoriza nada. Consequencia registrada: a partir daqui o valor e resolvido
  // no build, e nao a cada requisicao; um deployment pertence a exatamente um
  // ambiente, de modo que congela-lo no build e fiel ao que a variavel
  // significa. Ver environments.md, secao 5.1.
  env: {
    APP_ENV: process.env.APP_ENV ?? '',
  },
};

// Por que o wrapper e necessario, e nao herdado do wizard.
//
// `withSentryConfig` nao e cosmetico nesta versao: ele mantem os pacotes de
// runtime da SDK fora do bundle do servidor (`serverExternalPackages`) e
// registra o hook de modulo que instrumenta o servidor. Sem ele, a captura
// server-side e o tracing do App Router nao funcionam de forma confiavel.
//
// O entrypoint e `@sentry/nextjs/config`: o reexport em `@sentry/nextjs` esta
// deprecado desde 10.73.0 e sai na v11.
//
// Fora do escopo de F1-010, e por isso desligados explicitamente em vez de
// deixados no padrao: upload de source maps e criacao de release — ambos
// exigiriam `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e `SENTRY_PROJECT`, que
// permanecem sem consumidor. Nao ha `tunnelRoute`, nao ha integracao com a
// plataforma de deploy e nao ha monitor automatico.
export default withSentryConfig(nextConfig, {
  sourcemaps: { disable: true },
  release: { create: false },
  // O plugin de build envia, por padrao, telemetria propria ao provedor a cada
  // build. Nada nesta entrega precisa disso, e dado que sai sem necessidade e
  // superficie sem contrapartida (environments.md, secao 6.5).
  telemetry: false,
});
