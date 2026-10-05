'use client';

import Image from 'next/image';
import { mediaPath } from '@/modules/media/media-path';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  confirmImageUpload,
  deleteListingImage,
  getOwnerListingImages,
  reorderListingImages,
  requestImageReupload,
  requestImageUpload,
} from '@/modules/media/actions';
import type { OwnerImageView, UploadAuthorization } from '@/modules/media';
import { MediaFrame } from '@/components/data-display';
import { Alert, Progress } from '@/components/feedback';
import { FieldHint, FileUpload } from '@/components/forms';
import { Cluster, Grow, Section, Stack } from '@/components/layout';
import { Button, Card, Text } from '@/components/ui';
import { putFile } from './upload-transport';

// Gestao privada das imagens do anuncio (F2-008, #46). O binario vai do
// navegador direto ao R2; toda regra (dono, trava, seis posicoes, estado) e
// decidida no servidor. As validacoes daqui so antecipam a mensagem.

const MAX_IMAGES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const POLL_MS = 3000;

type LocalPhase =
  | { kind: 'uploading'; progress: number }
  | { kind: 'confirming' }
  | { kind: 'put_failed'; message: string };

interface LocalUpload {
  phase: LocalPhase;
  previewUrl?: string;
  /** Mantidos so em memoria, para repetir o PUT enquanto a URL vale. */
  auth?: UploadAuthorization;
  file?: File;
}

const STATE_LABEL: Record<OwnerImageView['state'], string> = {
  awaiting_upload: 'Aguardando envio',
  processing: 'Processando',
  ready: 'Pronta',
  failed: 'Falhou',
};

function validateFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) {
    return `"${file.name}": formato não suportado. Envie JPEG, PNG ou WebP.`;
  }
  if (file.size === 0) return `"${file.name}": o arquivo está vazio.`;
  if (file.size > MAX_BYTES) return `"${file.name}": o arquivo passa de 10 MB.`;
  return null;
}

export function ImageManager({
  listingId,
  initialImages,
}: {
  listingId: string;
  initialImages: OwnerImageView[];
}) {
  const [images, setImages] = useState<OwnerImageView[]>(initialImages);
  const [local, setLocal] = useState<Record<string, LocalUpload>>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);
  const reuploadTarget = useRef<string | null>(null);
  const reuploadInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const setPhase = useCallback((id: string, patch: Partial<LocalUpload>) => {
    setLocal((current) => ({ ...current, [id]: { ...current[id], ...patch } as LocalUpload }));
  }, []);

  const refresh = useCallback(async () => {
    const res = await getOwnerListingImages(listingId);
    if (res.success) setImages(res.data.images);
  }, [listingId]);

  // Enquanto houver imagem em processamento, acompanha o servidor.
  const processing = images.some((i) => i.state === 'processing');
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [processing, refresh]);

  async function sendAndConfirm(id: string, auth: UploadAuthorization, file: File) {
    setPhase(id, { phase: { kind: 'uploading', progress: 0 }, auth, file });
    setStatus(`Enviando imagem ${auth.position}.`);
    const put = await putFile(auth.uploadUrl, file, auth.uploadHeaders, (fraction) =>
      setPhase(id, { phase: { kind: 'uploading', progress: Math.round(fraction * 100) } }),
    );
    // 412: o objeto ja existe desta mesma URL (envio anterior concluido).
    if (put.status !== 200 && put.status !== 412) {
      setPhase(id, {
        phase: {
          kind: 'put_failed',
          message: 'O envio falhou. Verifique a conexão e tente de novo.',
        },
      });
      setError(`O envio da imagem ${auth.position} falhou.`);
      return;
    }
    setPhase(id, { phase: { kind: 'confirming' } });
    const confirmed = await confirmImageUpload(id);
    if (!confirmed.success) {
      setPhase(id, { phase: { kind: 'put_failed', message: confirmed.error } });
      setError(confirmed.error);
      return;
    }
    setLocal((current) => {
      const { [id]: done, ...rest } = current;
      return done?.previewUrl
        ? { ...rest, [id]: { phase: { kind: 'confirming' }, previewUrl: done.previewUrl } }
        : rest;
    });
    setStatus(
      confirmed.data.outcome === 'rejected'
        ? `Imagem ${auth.position} recusada.`
        : `Imagem ${auth.position} enviada. Processando.`,
    );
    await refresh();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      let count = images.length;
      for (const file of Array.from(files)) {
        if (count >= MAX_IMAGES) {
          setError(`O anúncio já tem o máximo de ${MAX_IMAGES} imagens.`);
          break;
        }
        const invalid = validateFile(file);
        if (invalid) {
          setError(invalid);
          continue;
        }
        const res = await requestImageUpload(listingId, file.type, file.size);
        if (!res.success) {
          setError(res.error);
          if (res.reason === 'limit_reached') break;
          continue;
        }
        count += 1;
        const auth = res.data;
        const previewUrl =
          typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined;
        const reserved: OwnerImageView = {
          id: auth.imageId,
          position: auth.position,
          state: 'awaiting_upload',
          width: null,
          height: null,
          failureMessage: null,
        };
        setImages((current) => [...current, reserved].sort((a, b) => a.position - b.position));
        setLocal((current) => ({
          ...current,
          [auth.imageId]: { phase: { kind: 'uploading', progress: 0 }, previewUrl },
        }));
        await sendAndConfirm(auth.imageId, auth, file);
      }
    } finally {
      setBusy(false);
    }
  }

  async function retryPut(id: string) {
    const entry = local[id];
    if (!entry?.auth || !entry.file) return;
    setError(null);
    setBusy(true);
    try {
      await sendAndConfirm(id, entry.auth, entry.file);
    } finally {
      setBusy(false);
    }
  }

  async function handleReupload(files: FileList | null) {
    const id = reuploadTarget.current;
    reuploadTarget.current = null;
    const file = files?.[0];
    if (!id || !file) return;
    setError(null);
    const invalid = validateFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const res = await requestImageReupload(id, file.type, file.size);
      if (!res.success) {
        setError(res.error);
        return;
      }
      const previewUrl =
        typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined;
      setImages((current) =>
        current.map((i) =>
          i.id === id ? { ...i, state: 'awaiting_upload', failureMessage: null } : i,
        ),
      );
      setLocal((current) => ({
        ...current,
        [id]: { phase: { kind: 'uploading', progress: 0 }, previewUrl },
      }));
      await sendAndConfirm(id, res.data, file);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setConfirmingRemoval(null);
    setError(null);
    setBusy(true);
    try {
      const res = await deleteListingImage(id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setStatus('Imagem removida.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const order = images.map((i) => i.id);
    [order[index], order[target]] = [order[target], order[index]];
    setError(null);
    setBusy(true);
    try {
      const res = await reorderListingImages(listingId, order);
      if (!res.success) {
        setError(res.error);
        await refresh();
        return;
      }
      setStatus(`Imagem movida para a posição ${target + 1}.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const full = images.length >= MAX_IMAGES;

  return (
    <Section
      titleId="imagens-titulo"
      title="Imagens do anúncio"
      description={`De 1 a ${MAX_IMAGES} fotos em JPEG, PNG ou WebP, até 10 MB cada. A primeira é a capa.`}
    >
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      {error && (
        <Alert ref={errorRef} tabIndex={-1} role="alert" tone="error">
          {error}
        </Alert>
      )}

      <Stack gap={2}>
        <FileUpload
          id="image-input"
          title="Adicionar fotos"
          accept={ACCEPTED.join(',')}
          multiple
          disabled={full || busy}
          aria-describedby="image-input-hint"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <FieldHint id="image-input-hint">
          {full
            ? `Limite de ${MAX_IMAGES} imagens atingido.`
            : `${images.length} de ${MAX_IMAGES} imagens.`}
        </FieldHint>
        <input
          ref={reuploadInput}
          type="file"
          accept={ACCEPTED.join(',')}
          aria-label="Escolher arquivo para reenviar"
          tabIndex={-1}
          onChange={(e) => {
            void handleReupload(e.target.files);
            e.target.value = '';
          }}
          className="sr-only"
        />
      </Stack>

      {images.length === 0 ? (
        <Text size="small" tone="muted">
          Nenhuma imagem ainda.
        </Text>
      ) : (
        <Stack as="ol" gap={3} aria-label="Imagens do anúncio">
          {images.map((image, index) => {
            const entry = local[image.id];
            const phase = entry?.phase;
            const label = `Imagem ${image.position}${image.position === 1 ? ' (capa)' : ''}`;
            let stateText = STATE_LABEL[image.state];
            if (phase?.kind === 'uploading') stateText = `Enviando: ${phase.progress}%`;
            else if (phase?.kind === 'confirming' && image.state === 'awaiting_upload')
              stateText = 'Confirmando envio';
            else if (phase?.kind === 'put_failed') stateText = 'Envio falhou';
            const failed = image.state === 'failed' || phase?.kind === 'put_failed';

            return (
              <Card as="li" key={image.id} aria-label={label} padding="sm">
                <Cluster align="start" nowrap>
                  <MediaFrame ratio="square" rounded size="thumb">
                    {entry?.previewUrl ? (
                      // Pre-visualizacao do arquivo LOCAL (blob:), sem otimizador.
                      <Image src={entry.previewUrl} alt="" width={72} height={72} unoptimized />
                    ) : image.state === 'ready' ? (
                      // Miniatura pela rota autorizada /media: acesso privado do
                      // dono, sem Image Optimization (media-pipeline-contract.md, 9).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaPath(image.id, 'thumb')} alt="" width={72} height={72} />
                    ) : null}
                  </MediaFrame>

                  <Grow>
                    <Stack gap={2}>
                      <Stack gap={1}>
                        <Text weight="semibold">{label}</Text>
                        <Text size="small" tone={failed ? 'error' : 'default'}>
                          Estado: {stateText}
                        </Text>
                        {image.state === 'failed' && image.failureMessage && (
                          <Text size="small" tone="error">
                            {image.failureMessage}
                          </Text>
                        )}
                        {phase?.kind === 'put_failed' && (
                          <Text size="small" tone="error">
                            {phase.message}
                          </Text>
                        )}
                      </Stack>
                      {phase?.kind === 'uploading' && (
                        <Progress value={phase.progress} label={`Envio da ${label}`} />
                      )}

                      <Cluster gap={2}>
                        <Button
                          variant="outline"
                          iconStart="arrow-up"
                          disabled={busy || index === 0}
                          aria-label={`Mover ${label} para cima`}
                          onClick={() => void move(index, -1)}
                        >
                          Subir
                        </Button>
                        <Button
                          variant="outline"
                          iconStart="arrow-down"
                          disabled={busy || index === images.length - 1}
                          aria-label={`Mover ${label} para baixo`}
                          onClick={() => void move(index, 1)}
                        >
                          Descer
                        </Button>
                        {phase?.kind === 'put_failed' && entry?.auth && (
                          <Button
                            variant="outline"
                            iconStart="refresh"
                            disabled={busy}
                            onClick={() => void retryPut(image.id)}
                          >
                            Tentar de novo
                          </Button>
                        )}
                        {image.state === 'failed' && (
                          <Button
                            variant="outline"
                            iconStart="upload"
                            disabled={busy}
                            aria-label={`Reenviar ${label}`}
                            onClick={() => {
                              reuploadTarget.current = image.id;
                              reuploadInput.current?.click();
                            }}
                          >
                            Reenviar
                          </Button>
                        )}
                        {confirmingRemoval === image.id ? (
                          <>
                            <Button
                              variant="danger"
                              iconStart="trash"
                              disabled={busy}
                              onClick={() => void remove(image.id)}
                            >
                              Confirmar remoção
                            </Button>
                            <Button variant="outline" onClick={() => setConfirmingRemoval(null)}>
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="dangerOutline"
                            iconStart="trash"
                            disabled={busy}
                            aria-label={`Remover ${label}`}
                            onClick={() => setConfirmingRemoval(image.id)}
                          >
                            Remover
                          </Button>
                        )}
                      </Cluster>
                    </Stack>
                  </Grow>
                </Cluster>
              </Card>
            );
          })}
        </Stack>
      )}
    </Section>
  );
}
