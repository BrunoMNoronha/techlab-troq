import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Fontes vetoriais da marca. O simbolo e a palavra TROQS usam geometria,
// sem fonte externa; textos das artes usam Arial/sans-serif.
const root = new URL('../../', import.meta.url);
const blue = '#2563eb';
const ink = '#111827';
const assets = [];

function svg(width, height, content, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">${content}</svg>`;
}

function symbol(color = '#ffffff') {
  return `<g fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><circle cx="47" cy="47" r="25"/><path d="m63 63 16 16"/></g>`;
}

function tile({ maskable = false, background = blue, foreground = '#ffffff' } = {}) {
  return `<rect width="100" height="100" rx="${maskable ? 0 : 24}" fill="${background}"/><g transform="translate(50 50) scale(${maskable ? 0.74 : 1}) translate(-50 -50)">${symbol(foreground)}</g>`;
}

function wordmark(color = ink) {
  return `<g fill="none" stroke="${color}" stroke-width="12" stroke-linecap="square" stroke-linejoin="round"><path d="M6 10h52M32 10v68M82 78V10h23c34 0 34 34 0 34H82"/><path d="m109 50 23 28" stroke-linecap="butt"/><rect x="153" y="10" width="52" height="68" rx="26"/><rect x="230" y="10" width="52" height="68" rx="26"/><path d="m264 60 28 24"/><path d="M360 10h-26a17 17 0 0 0 0 34h12a17 17 0 0 1 0 34h-28"/></g>`;
}

function logo(color = ink) {
  return svg(
    600,
    160,
    `<g transform="translate(12 12) scale(1.36)">${tile()}</g><g transform="translate(186 31) scale(1.05)">${wordmark(color)}</g>`,
    'Logotipo TROQS',
  );
}

function text(x, y, size, content, options = '') {
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="#ffffff" ${options}>${content}</text>`;
}

function backdrop(width, height) {
  return `<defs><linearGradient id="background" x2="1" y2="1"><stop stop-color="${blue}"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#background)"/><g fill="none" stroke="#ffffff" opacity="0.06" stroke-width="2"><circle cx="${width}" cy="0" r="${width * 0.36}"/><circle cx="${width}" cy="0" r="${width * 0.5}"/><circle cx="0" cy="${height}" r="${width * 0.36}"/></g>`;
}

function share() {
  return svg(
    1200,
    630,
    `${backdrop(1200, 630)}
    ${text(76, 62, 17, 'TECHLAB+', 'font-weight="700" letter-spacing="3"')}
    <g transform="translate(76 102) scale(0.9)">${tile({ background: '#ffffff', foreground: blue })}</g>
    <g transform="translate(196 98) scale(1.1)">${wordmark('#ffffff')}</g>
    ${text(76, 322, 64, 'Anúncios entre pessoas.', 'font-weight="700" letter-spacing="-2"')}
    ${text(76, 399, 64, 'Contato protegido.', 'font-weight="700" letter-spacing="-2"')}
    ${text(78, 470, 25, 'Explore ofertas e encontre novas possibilidades.', 'opacity="0.85"')}
    <path d="M76 532h1048" stroke="#ffffff" opacity="0.2"/>
    ${text(78, 574, 24, 'troqs.app', 'font-weight="700"')}
    ${text(1124, 574, 18, 'TROQS', 'text-anchor="end" opacity="0.75"')}`,
    'TROQS — anúncios entre pessoas, com contato protegido',
  );
}

function post() {
  return svg(
    1080,
    1080,
    `${backdrop(1080, 1080)}
    ${text(540, 105, 20, 'TECHLAB+', 'text-anchor="middle" font-weight="700" letter-spacing="4"')}
    <g transform="translate(448 186) scale(1.84)">${tile({ background: '#ffffff', foreground: blue })}</g>
    <g transform="translate(245 420) scale(1.6)">${wordmark('#ffffff')}</g>
    ${text(540, 665, 54, 'Anúncios entre pessoas.', 'text-anchor="middle" font-weight="700" letter-spacing="-1"')}
    ${text(540, 736, 54, 'Contato protegido.', 'text-anchor="middle" font-weight="700" letter-spacing="-1"')}
    <path d="M464 843h152" stroke="#ffffff" opacity="0.35" stroke-width="2"/>
    ${text(540, 928, 30, 'troqs.app', 'text-anchor="middle" font-weight="700"')}`,
    'Post TROQS — anúncios entre pessoas, com contato protegido',
  );
}

function story() {
  return svg(
    1080,
    1920,
    `${backdrop(1080, 1920)}
    ${text(540, 365, 23, 'TECHLAB+', 'text-anchor="middle" font-weight="700" letter-spacing="4"')}
    <g transform="translate(420 450) scale(2.4)">${tile({ background: '#ffffff', foreground: blue })}</g>
    <g transform="translate(190 774) scale(1.9)">${wordmark('#ffffff')}</g>
    ${text(540, 1080, 62, 'Anúncios entre', 'text-anchor="middle" font-weight="700" letter-spacing="-1"')}
    ${text(540, 1160, 62, 'pessoas.', 'text-anchor="middle" font-weight="700" letter-spacing="-1"')}
    ${text(540, 1290, 48, 'Contato protegido.', 'text-anchor="middle" font-weight="700"')}
    <path d="M464 1392h152" stroke="#ffffff" opacity="0.35" stroke-width="2"/>
    ${text(540, 1490, 36, 'troqs.app', 'text-anchor="middle" font-weight="700"')}`,
    'Story TROQS — anúncios entre pessoas, com contato protegido',
  );
}

function cover() {
  return svg(
    1584,
    396,
    `${backdrop(1584, 396)}
    <g transform="translate(108 148) scale(1)">${tile({ background: '#ffffff', foreground: blue })}</g>
    <g transform="translate(248 150) scale(1.1)">${wordmark('#ffffff')}</g>
    ${text(712, 181, 42, 'Anúncios entre pessoas.', 'font-weight="700"')}
    ${text(712, 243, 42, 'Contato protegido.', 'font-weight="700"')}
    ${text(1436, 332, 24, 'troqs.app', 'text-anchor="end" font-weight="700"')}`,
    'Capa TROQS — anúncios entre pessoas, com contato protegido',
  );
}

async function save(path, data, { url, purpose, width, height, type } = {}) {
  const target = fileURLToPath(new URL(path, root));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  assets.push({
    file: path,
    url,
    purpose,
    width,
    height,
    type,
    bytes: Buffer.byteLength(data),
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}

async function png(path, source, width, height, purpose, url) {
  const data = await sharp(Buffer.from(source)).resize(width, height).png().toBuffer();
  await save(path, data, { url, purpose, width, height, type: 'image/png' });
  return data;
}

// ICO com PNGs de 16/32/48 px: evita depender de um conversor adicional.
async function favicon(source) {
  const sizes = [16, 32, 48];
  const frames = await Promise.all(
    sizes.map((size) => sharp(Buffer.from(source)).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index];
    header[entry + 1] = sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await save('src/app/favicon.ico', Buffer.concat([header, ...frames]), {
    url: '/favicon.ico',
    purpose: 'Favicon multirresolucao 16/32/48 px',
    type: 'image/x-icon',
  });
}

const mark = svg(100, 100, tile(), 'Símbolo TROQS');
const maskable = svg(100, 100, tile({ maskable: true }), 'Ícone adaptável TROQS');
const apple = svg(100, 100, tile({ maskable: true }), 'Ícone TROQS para Apple');

await save('public/brand/logo-mark.svg', mark, {
  url: '/brand/logo-mark.svg',
  purpose: 'Simbolo vetorial',
  width: 100,
  height: 100,
  type: 'image/svg+xml',
});
for (const [name, color] of [
  ['logo', ink],
  ['logo-white', '#ffffff'],
]) {
  await save(`public/brand/${name}.svg`, logo(color), {
    url: `/brand/${name}.svg`,
    purpose: 'Logotipo horizontal vetorial com fundo transparente',
    width: 600,
    height: 160,
    type: 'image/svg+xml',
  });
  await png(
    `public/brand/${name}.png`,
    logo(color),
    1200,
    320,
    'Logotipo horizontal',
    `/brand/${name}.png`,
  );
}
await save('src/app/icon.svg', mark, {
  url: '/icon.svg',
  purpose: 'Icone vetorial do navegador',
  width: 100,
  height: 100,
  type: 'image/svg+xml',
});
await favicon(mark);
for (const size of [16, 32, 48]) {
  await png(
    `public/icons/favicon-${size}.png`,
    mark,
    size,
    size,
    'Favicon PNG',
    `/icons/favicon-${size}.png`,
  );
}
for (const size of [192, 512]) {
  await png(
    `public/icons/icon-${size}.png`,
    mark,
    size,
    size,
    'Icone de instalacao',
    `/icons/icon-${size}.png`,
  );
  await png(
    `public/icons/icon-maskable-${size}.png`,
    maskable,
    size,
    size,
    'Icone adaptavel com margem segura',
    `/icons/icon-maskable-${size}.png`,
  );
}
await png('src/app/apple-icon.png', apple, 180, 180, 'Apple touch icon opaco', '/apple-icon.png');
await png(
  'public/icons/apple-touch-icon.png',
  apple,
  180,
  180,
  'Apple touch icon para download',
  '/icons/apple-touch-icon.png',
);
await png(
  'public/brand/logo-oauth-120.png',
  apple,
  120,
  120,
  'Upload de logo no Google OAuth',
  '/brand/logo-oauth-120.png',
);
await png('public/brand/logo-512.png', mark, 512, 512, 'Simbolo PNG', '/brand/logo-512.png');
await png(
  'public/brand/logo-1024.png',
  mark,
  1024,
  1024,
  'Simbolo PNG de alta resolucao',
  '/brand/logo-1024.png',
);
await png(
  'public/social/avatar-1080.png',
  apple,
  1080,
  1080,
  'Avatar com margem para recorte circular',
  '/social/avatar-1080.png',
);
const sharing = await png(
  'public/social/share-1200x630.png',
  share(),
  1200,
  630,
  'Compartilhamento Open Graph e X',
  '/social/share-1200x630.png',
);
for (const convention of ['opengraph-image', 'twitter-image']) {
  await save(`src/app/${convention}.png`, sharing, {
    url: `/${convention}.png`,
    purpose: 'Imagem social descoberta automaticamente pelo Next.js',
    width: 1200,
    height: 630,
    type: 'image/png',
  });
  await writeFile(
    new URL(`src/app/${convention}.alt.txt`, root),
    'TROQS — anúncios entre pessoas, com contato protegido. troqs.app\n',
  );
}
await png(
  'public/social/post-1080x1080.png',
  post(),
  1080,
  1080,
  'Post quadrado',
  '/social/post-1080x1080.png',
);
await png(
  'public/social/story-1080x1920.png',
  story(),
  1080,
  1920,
  'Story vertical com conteudo na area central',
  '/social/story-1080x1920.png',
);
await png(
  'public/social/cover-1584x396.png',
  cover(),
  1584,
  396,
  'Capa horizontal para redes sociais',
  '/social/cover-1584x396.png',
);

await writeFile(
  new URL('public/brand/assets-manifest.json', root),
  `${JSON.stringify({ name: 'TROQS', colors: { primary: blue, text: ink, background: '#ffffff' }, assets }, null, 2)}\n`,
);
console.log(
  `${assets.length} arquivos de marca gerados; catalogo: public/brand/assets-manifest.json`,
);
