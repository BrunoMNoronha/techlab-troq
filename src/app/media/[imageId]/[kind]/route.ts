import { serveMedia } from '@/modules/media/delivery';

// GET /media/{imageId}/{kind} — unica entrega de imagem de anuncio
// (media-pipeline-contract.md, secao 9). Dinamica e sem cache em camada
// nenhuma: a autorizacao e reconferida a cada requisicao, e a resposta leva
// `private, no-store`. Nenhum `use cache`, ISR ou cache de CDN.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ imageId: string; kind: string }> },
): Promise<Response> {
  const { imageId, kind } = await params;
  return serveMedia(imageId, kind);
}
