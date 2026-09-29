// Envio do binario do navegador DIRETO ao R2 pela presigned PUT
// (media-pipeline-contract.md, secao 5.2). XMLHttpRequest, e nao fetch, porque
// so ele informa o progresso do envio. Nenhum byte passa pelo servidor do TROQ.
// A URL e credencial temporaria: nunca vai para log nem para mensagem de erro.

export interface PutResult {
  /** Status HTTP; 0 quando a rede falhou antes de haver resposta. */
  status: number;
}

export function putFile(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<PutResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve({ status: xhr.status });
    xhr.onerror = () => resolve({ status: 0 });
    xhr.onabort = () => resolve({ status: 0 });
    xhr.send(file);
  });
}
