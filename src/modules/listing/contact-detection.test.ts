import { describe, expect, it } from 'vitest';
import {
  CONTACT_DATA_MESSAGE,
  containsContactData,
  detectContactCategories,
  normalizeForDetection,
  type ContactCategory,
} from './contact-detection';

// Corpus do detector (listing-contract.md, secao 10.1; #86). Todo dado aqui e
// sintetico: telefones com numeros de exemplo, e-mails em dominios ficticios e
// enderecos genericos.

const BLOCKED: [ContactCategory, string][] = [
  // Telefone brasileiro: com/sem DDD, +55, parenteses, pontos, hifens e espacos.
  ['phone', 'Chama no 11 98765-4321'],
  ['phone', '(11) 98765-4321'],
  ['phone', '(11)98765-4321'],
  ['phone', '+55 11 98765-4321'],
  ['phone', '+55 (11) 9 8765-4321'],
  ['phone', '5511987654321'],
  ['phone', '11987654321'],
  ['phone', '011 3333-4444'],
  ['phone', '(21) 3333-4444'],
  ['phone', '21.3333.4444'],
  ['phone', '11 9.8765.4321'],
  ['phone', 'ligue 98765-4321'],
  ['phone', '9 8765-4321'],
  ['phone', '987654321'],
  ['phone', 'fixo 3333-4444'],
  ['phone', 'fixo 3333.4444'],
  ['phone', 'WhatsApp: 11 98765 4321'],
  // Evasoes simples.
  ['phone', '1 1 9 8 7 6 5 4 3 2 1'],
  ['phone', '11 9-8-7-6-5-4-3-2-1'],
  ['phone', '1_1_9_8_7_6_5_4_3_2_1'],
  ['phone', '１１ ９８７６５-４３２１'], // digitos de largura total
  ['phone', '𝟏𝟏 𝟗𝟖𝟕𝟔𝟓-𝟒𝟑𝟐𝟏'], // digitos matematicos
  ['phone', '11​98765​4321'], // espaco de largura zero
  ['phone', '11 98765–4321'], // travessao
  ['phone', '11 98765-432O'], // letra O no lugar de zero
  ['phone', '11 98765-43o1'],
  // Links de WhatsApp.
  ['whatsapp', 'wa.me/5511987654321'],
  ['whatsapp', 'https://wa.me/message/ABCDEF'],
  ['whatsapp', 'WA.ME/qualquer'],
  ['whatsapp', 'wa . me / algo'],
  ['whatsapp', 'https://api.whatsapp.com/send?phone=x'],
  ['whatsapp', 'web.whatsapp.com'],
  ['whatsapp', 'chat.whatsapp.com/ConviteGrupo'],
  ['whatsapp', 'whatsapp.com/send?phone=x'],
  ['whatsapp', 'wa.link/abc123'],
  // E-mail.
  ['email', 'fulano@exemplo.com'],
  ['email', 'Fulano.Silva+troq@Exemplo.com.br'],
  ['email', 'fulano @ exemplo . com'],
  ['email', 'fulano arroba exemplo ponto com'],
  ['email', 'fulano(at)exemplo.com'],
  ['email', 'fulano [at] exemplo [dot] com'],
  ['email', 'fulano@gmail'],
  ['email', 'fulano＠exemplo．com'], // arroba e ponto de largura total
  // Links de contato.
  ['contact_link', 'mailto:fulano'],
  ['contact_link', 'tel:+5511'],
  ['contact_link', 'TEL:999'],
  ['contact_link', 'sms:123'],
  ['contact_link', 'whatsapp://send?text=oi'],
  // Endereco: logradouro com numero, complemento, CEP, coordenadas e mapas.
  ['address', 'Rua Augusta, 500'],
  ['address', 'rua das Flores, 12 - Centro'],
  ['address', 'Rua 15 de Novembro, 300'],
  ['address', 'Avenida Paulista nº 1000'],
  ['address', 'Av. Brasil, 20'],
  ['address', 'av paulista, n. 1000'],
  ['address', 'Al. Santos, 45'],
  ['address', 'Travessa do Comércio, 7'],
  ['address', 'Praça da Sé, 1'],
  ['address', 'Estrada Velha, 1200'],
  ['address', 'Rua Augusta 500 apto 12'],
  ['address', 'Rua Augusta 500, bloco B'],
  ['address', 'retirar na rua augusta, 500'],
  ['address', 'Quadra 5 Lote 10'],
  ['address', 'Qd 12 conj 3'],
  ['address', 'CEP 01310-100'],
  ['address', 'cep: 01310100'],
  ['address', '01310-100'],
  ['address', '01.310-100'],
  ['address', '-23.5505, -46.6333'],
  ['address', '23°33\'01"S'],
  ['address', 'https://maps.app.goo.gl/abc'],
  ['address', 'goo.gl/maps/abc'],
  ['address', 'https://www.google.com/maps/place/x'],
  ['address', 'maps.google.com/?q=x'],
  ['address', 'RUA AUGUSTA, 500'],
  ['address', 'Ｒｕａ Augusta, 500'], // letras de largura total
];

const ACCEPTED = [
  // Exemplos da issue.
  'TV 55 polegadas',
  'iPhone 15 128 GB',
  'mesa 120 x 80 cm',
  'Bicicleta aro 29 em ótimo estado, revisada.',
  // Medidas, capacidade, ano, modelo e codigo.
  'Notebook i7 16GB 512GB SSD 2021',
  'Placa de vídeo RTX 3060 12GB',
  'Galaxy S21 modelo SM-G9910',
  'Carro 2019/2020 com 45000 km',
  'modelo 2019-2020',
  'ano 2019 2020',
  'Geladeira 400 litros 220v',
  'Sofá 3 lugares 2,10 m',
  'Kit 10 20 30 40 50 60',
  'Tênis tamanhos 38 39 40 41 42',
  'código 12345678',
  'IMEI 356938035643809',
  'EAN 7891234567895',
  'Preço de referência R$ 1.500,00',
  'Monitor 27" 144 Hz',
  'Bateria 5000 mAh',
  'Lote de 3 camisetas',
  // Cidade/UF e palavras isoladas que nao sao endereco.
  'Entrego em Recife - PE',
  'Maceió AL e região, 10 km',
  'Bike de rua aro 29, 21 marchas',
  'Skate de rua usado, 3 anos',
  'Bike de estrada aro 700, 22 marchas',
  'Tênis para rua ou esteira, 42',
  'Patins para rua, 2 pares',
  'Roupa de rua tamanho M',
  'Quadra de tênis portátil',
  'Casa de bonecas com 3 andares',
  'Avenida principal do jogo',
  // Mera mencao a WhatsApp, e-mail ou telefone, sem o dado.
  'Combinamos pelo WhatsApp depois da escolha.',
  'Aceito conversar pelo whats',
  'Envio fotos por e-mail após a escolha',
  'Tel: a combinar pelo app',
  'Hotel: não se aplica',
  'Vendo 1 arroba de lã',
  'Siga a loja @loja_exemplo',
  'Celular com tela de 6,5 polegadas',
  // Descricao sem contato.
  'Usado por 2 anos, sem arranhões. Acompanha carregador e capa. Troco por algo do mesmo valor.',
];

describe('detectContactCategories', () => {
  it.each(BLOCKED)('detecta %s em %j', (category, text) => {
    expect(detectContactCategories(text)).toContain(category);
  });

  it.each(ACCEPTED)('aceita %j', (text) => {
    expect(detectContactCategories(text)).toEqual([]);
  });

  it('detecta o dado no meio de texto comum e multilinha', () => {
    expect(
      containsContactData('Bicicleta ótima.\nQualquer dúvida:\n(11) 98765-4321\nObrigado'),
    ).toBe(true);
  });

  it('reporta varias categorias de uma vez, sem devolver o trecho', () => {
    const found = detectContactCategories('fulano@exemplo.com ou 11 98765-4321, Rua Augusta, 500');
    expect(found).toEqual(['phone', 'email', 'address']);
    expect(JSON.stringify(found)).not.toMatch(/\d|@/);
  });
});

describe('normalizeForDetection', () => {
  it('unifica largura, invisiveis, tracos, acentos, caixa e espacos', () => {
    expect(normalizeForDetection('ＰＲＡÇＡ​  da   Sé—１')).toBe('praca da se-1');
  });
});

describe('CONTACT_DATA_MESSAGE', () => {
  it('e a mensagem da issue, sem dado algum', () => {
    expect(CONTACT_DATA_MESSAGE).toBe(
      'Não inclua telefone, WhatsApp, e-mail ou endereço neste campo.',
    );
  });
});
