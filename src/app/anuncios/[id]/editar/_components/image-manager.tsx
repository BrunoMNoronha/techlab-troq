'use client';

import Image from 'next/image';
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

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  minHeight: '40px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  backgroundColor: 'white',
  color: '#111827',
  fontSize: '14px',
  cursor: 'pointer',
};

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
    <section aria-labelledby="imagens-titulo" style={{ marginTop: '32px' }}>
      <h2 id="imagens-titulo" style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>
        Imagens do anúncio
      </h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 12px' }}>
        De 1 a {MAX_IMAGES} fotos em JPEG, PNG ou WebP, até 10 MB cada. A primeira é a capa.
      </p>

      <div role="status" aria-live="polite" style={{ position: 'absolute', left: '-9999px' }}>
        {status}
      </div>

      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          style={{
            padding: '12px 16px',
            marginBottom: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <label
          htmlFor="image-input"
          style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
        >
          Adicionar fotos
        </label>
        <input
          id="image-input"
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          disabled={full || busy}
          aria-describedby="image-input-hint"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
          style={{ display: 'block', maxWidth: '100%', fontSize: '14px' }}
        />
        <p id="image-input-hint" style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>
          {full
            ? `Limite de ${MAX_IMAGES} imagens atingido.`
            : `${images.length} de ${MAX_IMAGES} imagens.`}
        </p>
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
          style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }}
        />
      </div>

      {images.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '14px' }}>Nenhuma imagem ainda.</p>
      ) : (
        <ol
          aria-label="Imagens do anúncio"
          style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px' }}
        >
          {images.map((image, index) => {
            const entry = local[image.id];
            const phase = entry?.phase;
            const label = `Imagem ${image.position}${image.position === 1 ? ' (capa)' : ''}`;
            let stateText = STATE_LABEL[image.state];
            if (phase?.kind === 'uploading') stateText = `Enviando: ${phase.progress}%`;
            else if (phase?.kind === 'confirming' && image.state === 'awaiting_upload')
              stateText = 'Confirmando envio';
            else if (phase?.kind === 'put_failed') stateText = 'Envio falhou';

            return (
              <li
                key={image.id}
                aria-label={label}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: '72px',
                    height: '72px',
                    flexShrink: 0,
                    borderRadius: '6px',
                    backgroundColor: '#f3f4f6',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6b7280',
                    fontSize: '12px',
                  }}
                >
                  {entry?.previewUrl ? (
                    // Pre-visualizacao do arquivo LOCAL (blob:), sem otimizador.
                    <Image
                      src={entry.previewUrl}
                      alt=""
                      width={72}
                      height={72}
                      unoptimized
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <span aria-hidden="true">📷</span>
                  )}
                </div>

                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: '600', fontSize: '15px' }}>{label}</p>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '14px',
                      color:
                        image.state === 'failed' || phase?.kind === 'put_failed'
                          ? '#991b1b'
                          : '#374151',
                    }}
                  >
                    Estado: {stateText}
                  </p>
                  {phase?.kind === 'uploading' && (
                    <progress
                      value={phase.progress}
                      max={100}
                      aria-label={`Envio da ${label}`}
                      style={{ width: '100%', marginTop: '6px' }}
                    />
                  )}
                  {image.state === 'failed' && image.failureMessage && (
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#991b1b' }}>
                      {image.failureMessage}
                    </p>
                  )}
                  {phase?.kind === 'put_failed' && (
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#991b1b' }}>
                      {phase.message}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    <button
                      type="button"
                      style={buttonStyle}
                      disabled={busy || index === 0}
                      aria-label={`Mover ${label} para cima`}
                      onClick={() => void move(index, -1)}
                    >
                      ↑ Subir
                    </button>
                    <button
                      type="button"
                      style={buttonStyle}
                      disabled={busy || index === images.length - 1}
                      aria-label={`Mover ${label} para baixo`}
                      onClick={() => void move(index, 1)}
                    >
                      ↓ Descer
                    </button>
                    {phase?.kind === 'put_failed' && entry?.auth && (
                      <button
                        type="button"
                        style={buttonStyle}
                        disabled={busy}
                        onClick={() => void retryPut(image.id)}
                      >
                        Tentar de novo
                      </button>
                    )}
                    {image.state === 'failed' && (
                      <button
                        type="button"
                        style={buttonStyle}
                        disabled={busy}
                        aria-label={`Reenviar ${label}`}
                        onClick={() => {
                          reuploadTarget.current = image.id;
                          reuploadInput.current?.click();
                        }}
                      >
                        Reenviar
                      </button>
                    )}
                    {confirmingRemoval === image.id ? (
                      <>
                        <button
                          type="button"
                          style={{ ...buttonStyle, color: '#991b1b', borderColor: '#fecaca' }}
                          disabled={busy}
                          onClick={() => void remove(image.id)}
                        >
                          Confirmar remoção
                        </button>
                        <button
                          type="button"
                          style={buttonStyle}
                          onClick={() => setConfirmingRemoval(null)}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        style={buttonStyle}
                        disabled={busy}
                        aria-label={`Remover ${label}`}
                        onClick={() => setConfirmingRemoval(image.id)}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
