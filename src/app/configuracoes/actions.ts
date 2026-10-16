'use server';

import { revalidatePath } from 'next/cache';
import { removeDemoData, requireDemoTarget, type DemoOperationResult } from '@/modules/demo-data';
import { validateSession } from '@/modules/identity';

export type RemoveDemoProductsResult =
  DemoOperationResult | { success: false; reason: 'login_required' | 'validation'; error: string };

const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Qualquer conta ativa e verificada pode remover o lote no alvo permitido. */
export async function removeDemoProducts(
  expectedBatchId: unknown,
): Promise<RemoveDemoProductsResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    return {
      success: false,
      reason: 'login_required',
      error:
        'Entre em uma conta ativa e com e-mail verificado para remover os produtos exemplares.',
    };
  }

  try {
    requireDemoTarget();
  } catch {
    return {
      success: false,
      reason: 'target',
      error: 'A remoção de produtos exemplares não está disponível neste ambiente.',
    };
  }

  if (typeof expectedBatchId !== 'string' || !BATCH_ID.test(expectedBatchId)) {
    return {
      success: false,
      reason: 'validation',
      error: 'Atualize a página e confirme novamente o lote de produtos exemplares.',
    };
  }

  try {
    const result = await removeDemoData(session.user.id, expectedBatchId);
    if (!result.success) {
      const messages = {
        conflict:
          'A remoção foi bloqueada. Nenhum produto foi removido. Atualize a página; alterações no lote ou vínculos de negócio exigem revisão antes de tentar novamente.',
        target: 'A remoção de produtos exemplares não está disponível neste ambiente.',
        stale_batch:
          'O lote de produtos exemplares mudou. Atualize a página e confirme o lote atual antes de remover.',
        error: 'Não foi possível remover os produtos exemplares. Tente novamente.',
      };
      return { ...result, error: messages[result.reason] };
    }

    revalidatePath('/configuracoes');
    revalidatePath('/explorar');
    revalidatePath('/anuncios');
    revalidatePath('/');
    return result;
  } catch {
    return {
      success: false,
      reason: 'error',
      error: 'Não foi possível remover os produtos exemplares. Tente novamente.',
    };
  }
}
