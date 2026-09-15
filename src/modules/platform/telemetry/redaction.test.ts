// Testes da fronteira de saida da telemetria (F1-010).
//
// O criterio e o RESULTADO: cada caso afirma que a sentinela proibida NAO
// sobrevive no valor saneado. Verificar que uma funcao foi chamada nao prova
// nada sobre o que sai do processo.
//
// Todos os valores sao ficticios e nenhum e dado pessoal real
// (docs/engineering/testing.md, secao 1, item 6). Os numeros seguem faixas
// reservadas a ficcao e os dominios usam `example.invalid`, que por definicao
// nunca resolve.

import { describe, expect, it } from 'vitest';
import { REDACTED, isForbiddenKey, redactText, sanitizeRecord, sanitizeUrl } from './redaction';
import { sanitizeBreadcrumb, sanitizeEvent, sanitizeLog, sanitizeSpan } from './sentry-options';

/** Sentinelas ficticias. Nenhuma delas pode aparecer em telemetria. */
const SENTINELS = {
  phone: '+55 11 99999-0001',
  whatsapp: '5511988880002',
  email: 'pessoa.ficticia@example.invalid',
  name: 'Fulana de Tal Ficticia',
  cpf: '123.456.789-09',
  address: 'Rua Ficticia 1000, apto 42',
  secret: 'SUBSTITUIR_TOKEN_FICTICIO_abcdef123456',
  card: '4111 1111 1111 1111',
  connectionString: 'postgresql://usuario:senhaficticia@db.example.invalid:5432/troq',
} as const;

/** Serializa o resultado para afirmar ausencia em QUALQUER campo aninhado. */
function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function expectNoSentinels(value: unknown, sentinels: readonly string[]): void {
  const serialized = serialize(value);
  for (const sentinel of sentinels) {
    expect(serialized).not.toContain(sentinel);
  }
}

describe('isForbiddenKey', () => {
  it.each([
    'phone',
    'telefone',
    'whatsApp',
    'e-mail',
    'E_Mail',
    'cpf',
    'nomeCompleto',
    'fullName',
    'endereco',
    'endereço',
    'authorization',
    'apiKey',
    'accessToken',
    'sessionCookie',
    'cardNumber',
    'contactId',
    'user',
  ])('trata "%s" como nome de campo proibido', (key) => {
    expect(isForbiddenKey(key)).toBe(true);
  });

  it.each(['sentry.sdk.name', 'sentry.trace.parent_span_id'])(
    'preserva o atributo reservado da SDK "%s"',
    (key) => {
      expect(isForbiddenKey(key)).toBe(false);
    },
  );

  it.each(['listingId', 'requestId', 'attemptId', 'durationMs', 'status'])(
    'preserva o identificador tecnico "%s"',
    (key) => {
      expect(isForbiddenKey(key)).toBe(false);
    },
  );
});

describe('redactText', () => {
  it('redige telefone em texto livre', () => {
    expect(redactText(`falha ao notificar ${SENTINELS.phone}`)).not.toContain('99999');
  });

  it('redige WhatsApp sem formatacao', () => {
    expect(redactText(`destino ${SENTINELS.whatsapp}`)).not.toContain(SENTINELS.whatsapp);
  });

  it('redige email', () => {
    expect(redactText(`destinatario ${SENTINELS.email}`)).toContain('[redacted:email]');
  });

  it('redige CPF com e sem mascara', () => {
    expect(redactText(SENTINELS.cpf)).toBe('[redacted:cpf]');
    expect(redactText('documento 12345678909')).toBe('documento [redacted:cpf]');
  });

  it('redige numero de cartao', () => {
    expect(redactText(SENTINELS.card)).not.toContain('4111');
  });

  it('redige string de conexao com credencial embutida', () => {
    expect(redactText(SENTINELS.connectionString)).toBe('[redacted:credential]');
  });

  it('redige credencial declarada em texto livre', () => {
    expect(redactText(`token=${SENTINELS.secret}`)).toBe('token=[redacted]');
    expect(redactText('Authorization: Bearer abcdef0123456789')).not.toContain('abcdef0123456789');
  });

  it('nao destroi texto sem dado proibido', () => {
    expect(redactText('falha ao aplicar transicao de anuncio')).toBe(
      'falha ao aplicar transicao de anuncio',
    );
  });
});

describe('sanitizeUrl', () => {
  it('remove a query string inteira', () => {
    expect(sanitizeUrl(`https://app.example.invalid/busca?telefone=${SENTINELS.whatsapp}`)).toBe(
      'https://app.example.invalid/busca',
    );
  });

  it('remove credencial embutida no host', () => {
    const sanitized = sanitizeUrl('https://usuario:senhaficticia@app.example.invalid/painel');
    expect(sanitized).toBe('https://app.example.invalid/painel');
  });

  it('redige dado proibido presente no caminho', () => {
    const sanitized = sanitizeUrl(`https://app.example.invalid/pessoas/${SENTINELS.whatsapp}`);
    expect(sanitized).not.toContain(SENTINELS.whatsapp);
  });
});

describe('sanitizeRecord', () => {
  it('redige por nome de campo e por padrao de valor, em qualquer profundidade', () => {
    const sanitized = sanitizeRecord({
      telefone: SENTINELS.phone,
      whatsapp: SENTINELS.whatsapp,
      nome: SENTINELS.name,
      cpf: SENTINELS.cpf,
      endereco: SENTINELS.address,
      apiKey: SENTINELS.secret,
      cartao: SENTINELS.card,
      aninhado: { contato: { email: SENTINELS.email } },
      mensagemLivre: `contato ${SENTINELS.phone} e ${SENTINELS.email}`,
      listingId: 'lst_0001',
    });

    expectNoSentinels(sanitized, Object.values(SENTINELS));
    expect(sanitized.telefone).toBe(REDACTED);
    expect(sanitized.listingId).toBe('lst_0001');
  });

  it('resiste a ciclo e a profundidade excessiva', () => {
    const cyclic: Record<string, unknown> = { listingId: 'lst_0002' };
    cyclic.self = cyclic;
    expect(() => sanitizeRecord(cyclic)).not.toThrow();
  });
});

describe('sanitizeEvent', () => {
  it('remove dado proibido de mensagem, excecao, tags, contexts, extras e breadcrumbs', () => {
    const hint = { attachments: [{ filename: 'dump.bin', data: 'x' }] };

    const sanitized = sanitizeEvent(
      {
        message: `falha ao liberar contato ${SENTINELS.phone}`,
        transaction: `GET /pessoas/${SENTINELS.whatsapp}`,
        exception: {
          values: [{ type: 'Error', value: `CPF ${SENTINELS.cpf} invalido` }],
        },
        tags: { telefone: SENTINELS.phone, rota: `/busca?email=${SENTINELS.email}` },
        contexts: { negociacao: { whatsapp: SENTINELS.whatsapp, estado: 'aberta' } },
        extra: { endereco: SENTINELS.address, nome: SENTINELS.name },
        breadcrumbs: [
          { category: 'ui.input', message: SENTINELS.cpf },
          { category: 'fetch', message: `POST /contatos ${SENTINELS.email}` },
        ],
        spans: [
          {
            span_id: 'a1',
            trace_id: 'b2',
            start_timestamp: 1,
            description: `db ${SENTINELS.email}`,
            data: { telefone: SENTINELS.phone },
          },
        ],
        user: { id: 'usr_1', email: SENTINELS.email, username: SENTINELS.name },
        request: {
          method: 'POST',
          url: `https://app.example.invalid/contatos?telefone=${SENTINELS.whatsapp}`,
          headers: { authorization: `Bearer ${SENTINELS.secret}` },
          cookies: { session: 'abc' },
          data: { cpf: SENTINELS.cpf },
          query_string: `telefone=${SENTINELS.whatsapp}`,
        },
      },
      hint,
    );

    expectNoSentinels(sanitized, Object.values(SENTINELS));
    expect(sanitized.user).toBeUndefined();
    expect(sanitized.request).toEqual({
      method: 'POST',
      url: 'https://app.example.invalid/contatos',
    });
    expect(sanitized.breadcrumbs).toHaveLength(1);
    expect(sanitized.breadcrumbs?.[0]?.category).toBe('fetch');
    expect(hint.attachments).toEqual([]);
  });
});

describe('sanitizeSpan', () => {
  it('redige descricao e atributos do span', () => {
    const sanitized = sanitizeSpan({
      span_id: 'a1',
      trace_id: 'b2',
      start_timestamp: 1,
      op: 'http.server',
      description: `GET /pessoas/${SENTINELS.whatsapp}`,
      data: { telefone: SENTINELS.phone, 'http.route': '/pessoas/[id]' },
    });

    expectNoSentinels(sanitized, Object.values(SENTINELS));
    expect(sanitized.data['http.route']).toBe('/pessoas/[id]');
  });
});

describe('sanitizeBreadcrumb', () => {
  it('descarta a categoria de entrada de usuario', () => {
    expect(sanitizeBreadcrumb({ category: 'ui.input', message: SENTINELS.cpf })).toBeNull();
  });

  it('sanea as demais categorias', () => {
    const sanitized = sanitizeBreadcrumb({
      category: 'fetch',
      message: `POST /contatos ${SENTINELS.phone}`,
      data: { email: SENTINELS.email },
    });

    expectNoSentinels(sanitized, Object.values(SENTINELS));
  });
});

describe('sanitizeLog', () => {
  it('redige corpo e atributos do log estruturado', () => {
    const sanitized = sanitizeLog({
      level: 'info',
      message: `contato liberado para ${SENTINELS.phone}`,
      attributes: {
        whatsapp: SENTINELS.whatsapp,
        email: SENTINELS.email,
        requestId: 'req_0001',
      },
    });

    expectNoSentinels(sanitized, Object.values(SENTINELS));
    expect(sanitized.attributes?.requestId).toBe('req_0001');
  });
});

describe('correlacao tecnica', () => {
  it('preserva identificador hexadecimal de trace e de span', () => {
    const traceId = '4fd853ff68ce4b3fa7bee012345678ac';
    const spanId = 'ad17ec9b5d043192';
    expect(redactText(traceId)).toBe(traceId);
    expect(redactText(spanId)).toBe(spanId);
  });

  it('nao usa telefone nem WhatsApp como chave de correlacao, em nenhuma forma', () => {
    const derived = {
      telefoneHash: 'sha256:0000',
      whatsappMascarado: '+55 11 *****-0001',
      telefoneTruncado: '11999',
      correlationKey: SENTINELS.whatsapp,
    };

    const sanitized = sanitizeRecord(derived);

    expect(sanitized.telefoneHash).toBe(REDACTED);
    expect(sanitized.whatsappMascarado).toBe(REDACTED);
    expect(sanitized.telefoneTruncado).toBe(REDACTED);
    expect(sanitized.correlationKey).not.toContain(SENTINELS.whatsapp);
  });
});
