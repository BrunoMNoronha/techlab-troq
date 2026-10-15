import { countFreeSlots } from '@/modules/request';

/**
 * Vagas livres dos anuncios de uma pagina da vitrine (DEC-056). Falha na
 * contagem nao derruba a vitrine: os cards saem sem o bloco de vagas, e a
 * reserva continua decidida no servidor, sob a trava.
 */
export async function loadFreeSlots(listingIds: string[]): Promise<Map<string, number>> {
  try {
    return await countFreeSlots(listingIds);
  } catch (err) {
    console.error('[Vitrine] falha ao contar vagas livres', err);
    return new Map();
  }
}
