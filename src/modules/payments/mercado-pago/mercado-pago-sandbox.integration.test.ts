// @vitest-environment node
//
// Suite OPCIONAL contra o sandbox do Mercado Pago (F3-004, #94). Pulada por
// padrao e NUNCA executada na CI: exige `MERCADO_PAGO_INTEGRATION=1`,
// `APP_ENV=development` e `MERCADO_PAGO_ACCESS_TOKEN` de TESTE (PX-2; mesmo
// padrao de `R2_INTEGRATION`, docs/engineering/testing.md). Cria orders Pix
// reais de R$ 0,99 no ambiente de teste; nenhuma credencial de producao.
//
// Prova o que o servidor simulado de client.test.ts nao prova: que o provedor
// aceita o corpo exato, repete a mesma order para a mesma chave e cancela uma
// order sem acreditacao; e (F3-006, ADR-0008) que a busca da Payments API por
// `external_reference` devolve o instante de acreditacao da order acreditada.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { classifyAccreditation } from './accreditation';
import { createMercadoPagoClient, MERCADO_PAGO_API_BASE_URL } from './client';

const enabled =
  process.env.MERCADO_PAGO_INTEGRATION === '1' && process.env.APP_ENV === 'development';

/** Pagador de teste documentado pelo provedor (spike F0-010, G2). */
const TEST_PAYER = 'test_user_br@testuser.com';

describe.skipIf(!enabled)('Mercado Pago sandbox: Orders API real (PX-2)', () => {
  const client = createMercadoPagoClient({ timeoutMs: 20_000 });

  it('cria a cobranca de 0.99 e a mesma chave devolve a mesma order (T-15 no provedor)', async () => {
    const key = randomUUID();
    const input = {
      idempotencyKey: key,
      externalReference: `troq-sandbox-${randomUUID()}`,
      amountCents: 99,
      expiresInMs: 30 * 60 * 1000,
      payerEmail: TEST_PAYER,
    };
    const first = await client.createPixCharge(input);
    const second = await client.createPixCharge(input);
    if (!first.ok || !second.ok) throw new Error(`falha: ${JSON.stringify([first, second])}`);
    expect(second.value.snapshot.providerOrderId).toBe(first.value.snapshot.providerOrderId);
    expect(first.value.snapshot.payments[0]).toMatchObject({ isPix: true, amountCents: 99 });
    expect(first.value.instructions?.qrCode).toMatch(/^000201/);
    expect(['pending', 'accredited']).toContain(first.value.snapshot.state.kind);

    const read = await client.getOrder(first.value.snapshot.providerOrderId);
    expect(read.ok).toBe(true);
  }, 60_000);

  it('cancela uma order sem acreditacao', async () => {
    const created = await client.createPixCharge({
      idempotencyKey: randomUUID(),
      externalReference: `troq-sandbox-${randomUUID()}`,
      amountCents: 99,
      expiresInMs: 30 * 60 * 1000,
      payerEmail: TEST_PAYER,
    });
    if (!created.ok) throw new Error(`falha: ${JSON.stringify(created)}`);
    const canceled = await client.cancelOrder(created.value.snapshot.providerOrderId, randomUUID());
    expect(canceled).toMatchObject({
      ok: true,
      value: { state: { kind: 'not_accredited_terminal', outcome: 'canceled' } },
    });
  }, 60_000);

  it('ADR-0008: a busca por external_reference devolve date_approved da order acreditada', async () => {
    const externalReference = `troq-sandbox-${randomUUID()}`;
    // O adaptador nao envia nome do pagador; o sandbox so aprova sozinho com o
    // pagador de teste `APRO` documentado (spike F0-010, G2). Esta criacao e so
    // a preparacao; o que se prova e a consulta e a busca do cliente real.
    const res = await fetch(`${MERCADO_PAGO_API_BASE_URL}/v1/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        type: 'online',
        processing_mode: 'automatic',
        external_reference: externalReference,
        total_amount: '0.99',
        payer: { email: TEST_PAYER, first_name: 'APRO' },
        transactions: {
          payments: [
            {
              amount: '0.99',
              payment_method: { id: 'pix', type: 'bank_transfer' },
              expiration_time: 'PT30M',
            },
          ],
        },
      }),
    });
    expect(res.status).toBe(201);
    const orderId = ((await res.json()) as { id: string }).id;
    let accredited = false;

    // O sandbox acredita sozinho (spike F0-010, experimento 4).
    for (let i = 0; i < 24 && !accredited; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const read = await client.getOrder(orderId);
      accredited = read.ok && read.value.state.kind === 'accredited';
    }
    expect(accredited).toBe(true);

    const search = await client.findPaymentAccreditation(externalReference);
    if (!search.ok) throw new Error(`falha: ${JSON.stringify(search)}`);
    const verdict = classifyAccreditation(search.value, { externalReference, amountCents: 99 });
    expect(verdict).toMatchObject({ kind: 'approved' });
    if (verdict.kind === 'approved') {
      expect(verdict.accreditedAt.getTime()).toBeLessThanOrEqual(Date.now());
    }
  }, 180_000);
});
