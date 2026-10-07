import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Fontes vetoriais próprias do catálogo products-v1. Sem imagens externas,
// marcas, download, geração por IA ou dependência de serviço de terceiros.
const target = new URL('../../public/demo-products/', import.meta.url);
const SIZE = 960;
const ink = '#283b4b';
const cream = '#fffdf7';
const palettes = [
  ['#edf3ff', '#5269ca', '#b9c8f6'],
  ['#eaf5f0', '#37806c', '#a3d6bf'],
  ['#fff1e8', '#cc7655', '#f2c4a6'],
  ['#f2edfb', '#8065b0', '#c7b7e8'],
  ['#fff6dc', '#b68836', '#e9d192'],
];

const rect = (x, y, width, height, fill, rx = 12, extra = '') =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" ${extra}/>`;
const circle = (x, y, r, fill, extra = '') =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const ellipse = (x, y, rx, ry, fill, extra = '') =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, color, width = 10, extra = '') =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
const group = (transform, content) => `<g transform="${transform}">${content}</g>`;

function controller(color, scale = 1, x = 0, y = 0) {
  return group(
    `translate(${x} ${y}) scale(${scale})`,
    `${path('M90 45C105 5 150 8 180 23H300C330 8 375 5 390 45L420 140C440 202 408 225 377 185L330 143H150L103 185C72 225 40 202 60 140Z', color, `stroke="${ink}" stroke-width="8"`)}
    ${rect(113, 59, 16, 64, ink, 3)}${rect(89, 83, 64, 16, ink, 3)}
    ${circle(339, 65, 12, '#f0b258')}${circle(367, 93, 12, '#dd797e')}${circle(311, 93, 12, '#62ae9a')}${circle(339, 121, 12, '#7e95d1')}
    ${circle(193, 119, 24, ink)}${circle(285, 137, 24, ink)}${circle(193, 119, 12, '#637586')}${circle(285, 137, 12, '#637586')}
    ${rect(222, 65, 35, 10, '#637586', 5)}`,
  );
}

const products = [
  {
    title: 'Smartphone 128 GB',
    art: (c, light) => `${rect(321, 161, 318, 593, ink, 44)}${rect(337, 179, 286, 555, light, 31)}
      ${path('M337 497Q422 349 509 446T623 411V703Q623 734 592 734H368Q337 734 337 703Z', c)}
      ${path('M337 583Q435 492 529 565T623 551V703Q623 734 592 734H368Q337 734 337 703Z', '#f4d4b8')}
      ${rect(421, 190, 118, 27, ink, 14)}${circle(596, 292, 51, '#fff2d2')}
      ${rect(389, 649, 49, 49, cream, 12)}${rect(454, 649, 49, 49, cream, 12)}${rect(519, 649, 49, 49, cream, 12)}
      ${line(443, 718, 517, 718, ink, 6)}${line(642, 286, 642, 363, ink, 6)}`,
  },
  {
    title: 'Suporte de mesa para celular',
    art: (c, light) => `${ellipse(480, 716, 235, 28, light)}${rect(271, 645, 418, 62, c, 27)}
      ${path('M420 635L448 413H513L551 635Z', ink)}${circle(481, 458, 37, light)}${circle(481, 458, 19, c)}
      ${group('rotate(-9 480 392)', `${rect(351, 207, 260, 397, c, 28)}${rect(370, 225, 222, 348, light, 18)}${rect(380, 476, 202, 62, cream, 12)}${circle(483, 335, 69, c)}${path('M455 305L513 335L455 365Z', cream)}${rect(337, 543, 289, 45, ink, 12)}`)}
      ${line(316, 675, 375, 675, light, 8)}${line(586, 675, 645, 675, light, 8)}`,
  },
  {
    title: 'Notebook de 14 polegadas',
    art: (c, light) => `${rect(216, 211, 528, 360, ink, 24)}${rect(236, 233, 488, 308, light, 9)}
      ${path('M236 453L372 330L510 437L620 356L724 453V541H236Z', c)}${circle(627, 309, 41, '#fbe4af')}
      ${path('M216 571H744L836 686Q841 703 815 707H144Q118 703 124 686Z', '#b9c3cc', `stroke="${ink}" stroke-width="7"`)}
      ${path('M265 589H695L747 650H212Z', ink)}${path('M407 657H553L571 690H389Z', '#8b9ba8')}
      ${[0, 1, 2].map((row) => line(260 - row * 15, 608 + row * 14, 700 + row * 15, 608 + row * 14, '#80909e', 5)).join('')}`,
  },
  {
    title: 'Teclado USB',
    art: (
      c,
      light,
    ) => `${path('M471 310V223Q471 170 550 170H650', 'none', `stroke="${ink}" stroke-width="12" stroke-linecap="round"`)}${rect(649, 154, 60, 31, ink, 5)}
      ${group(
        'rotate(-8 480 520)',
        `${rect(136, 317, 688, 346, ink, 26)}${rect(153, 333, 654, 306, light, 16)}
        ${Array.from({ length: 4 }, (_, row) => Array.from({ length: 13 }, (_, col) => rect(177 + col * 47, 356 + row * 51, 37, 38, row === 0 ? c : cream, 6)).join('')).join('')}
        ${rect(179, 568, 66, 45, cream, 7)}${rect(258, 568, 76, 45, cream, 7)}${rect(347, 568, 286, 45, c, 7)}${rect(646, 568, 133, 45, cream, 7)}`,
      )}`,
  },
  {
    title: 'Caixa de som Bluetooth',
    art: (
      c,
      light,
    ) => `${path('M350 271V215Q350 166 398 166H561Q610 166 610 215V271', 'none', `stroke="${ink}" stroke-width="25"`)}
      ${rect(276, 251, 408, 451, c, 49)}${rect(296, 277, 367, 399, ink, 32)}${circle(480, 481, 150, '#4c6372')}${circle(480, 481, 123, '#344d5d')}${circle(480, 481, 77, ink)}${circle(480, 481, 36, '#627b8c')}
      ${Array.from({ length: 5 }, (_, row) => Array.from({ length: 7 }, (_, col) => circle(329 + col * 50, 310 + row * 80, 3, '#8da5af')).join('')).join('')}
      ${rect(432, 256, 96, 13, light, 6)}${rect(336, 702, 55, 21, ink, 7)}${rect(569, 702, 55, 21, ink, 7)}`,
  },
  {
    title: 'Rádio portátil',
    art: (c, light) => `${line(660, 362, 777, 172, '#98a7b1', 13)}${circle(778, 170, 12, ink)}
      ${path('M321 343V283Q321 253 351 253H604Q634 253 634 283V343', 'none', `stroke="${ink}" stroke-width="23"`)}
      ${rect(175, 329, 610, 345, c, 41)}${circle(355, 502, 129, ink)}${circle(355, 502, 102, '#4f626d')}${circle(355, 502, 77, ink)}
      ${Array.from({ length: 9 }, (_, i) => line(272 + i * 20, 430, 272 + i * 20, 572, '#7f929b', 5)).join('')}
      ${rect(525, 370, 211, 85, cream, 8)}${line(547, 415, 714, 415, ink, 5)}${line(625, 386, 625, 440, c, 6)}
      ${circle(578, 539, 41, ink)}${circle(578, 539, 23, light)}${circle(690, 539, 32, ink)}${circle(690, 539, 17, light)}${rect(250, 674, 75, 22, ink, 8)}${rect(635, 674, 75, 22, ink, 8)}`,
  },
  {
    title: 'Fone Bluetooth',
    art: (
      c,
      light,
    ) => `${path('M277 529V385C277 108 683 108 683 385V529', 'none', `stroke="${ink}" stroke-width="62"`)}
      ${path('M277 387C277 119 683 119 683 387', 'none', `stroke="${c}" stroke-width="35"`)}
      ${rect(234, 437, 141, 243, ink, 58)}${rect(584, 437, 141, 243, ink, 58)}${rect(262, 456, 93, 198, c, 40)}${rect(604, 456, 93, 198, c, 40)}
      ${rect(337, 466, 53, 178, light, 25)}${rect(570, 466, 53, 178, light, 25)}${circle(283, 616, 7, light)}${line(283, 546, 283, 580, light, 6)}`,
  },
  {
    title: 'Console de videogame',
    art: (
      c,
      light,
    ) => `${path('M259 228L498 175L585 229V696L326 740L259 692Z', cream, `stroke="${ink}" stroke-width="7"`)}
      ${path('M326 268L522 216V699L326 740Z', '#cbd7dc')}${path('M286 244L326 268V740L286 706Z', ink)}${line(315, 277, 315, 687, c, 10)}
      ${line(379, 611, 500, 581, ink, 10)}${circle(501, 672, 9, c)}${line(355, 698, 489, 667, '#96a9b3', 5)}
      ${controller(light, 0.75, 495, 544)}`,
  },
  {
    title: 'Controle de videogame',
    art: (c, light) => `${controller(light, 1.65, 80, 337)}${line(435, 365, 525, 365, c, 7)}`,
  },
  {
    title: 'Mesa de apoio de madeira',
    art: () => `${path('M307 470L343 749H386L365 470Z', '#96623e')}${path('M566 470L602 749H649L627 470Z', '#96623e')}${path('M450 473L433 734H475L506 473Z', '#bb855b')}
      ${ellipse(480, 424, 272, 100, '#ac784e')}${rect(208, 415, 544, 37, '#ac784e', 4)}${ellipse(480, 410, 272, 100, '#d7ac7f')}
      ${path('M245 413Q400 330 627 392M306 450Q474 368 701 423', 'none', 'stroke="#bd9064" stroke-width="7" opacity="0.7"')}
      ${ellipse(573, 383, 70, 22, '#c79567')}`,
  },
  {
    title: 'Luminária de mesa',
    art: (
      c,
      light,
    ) => `${ellipse(479, 726, 190, 38, ink)}${ellipse(479, 712, 184, 30, c)}${line(487, 708, 570, 480, ink, 19)}${line(570, 480, 421, 293, ink, 19)}
      ${line(504, 697, 592, 484, light, 8)}${line(591, 484, 434, 287, light, 8)}${circle(578, 481, 24, c)}${circle(578, 481, 10, ink)}
      ${group('rotate(18 408 313)', `${path('M327 225H467L527 376H267Z', c)}${ellipse(397, 375, 130, 27, ink)}${ellipse(397, 375, 111, 15, '#ffe5ab')}${rect(377, 205, 40, 35, ink, 6)}`)}
      ${path('M325 423L211 691H450L480 449', '#fff2c2', 'opacity="0.26"')}`,
  },
  {
    title: 'Cadeira de escritório',
    art: (
      c,
      light,
    ) => `${line(480, 594, 480, 736, ink, 32)}${line(480, 712, 322, 769, ink, 22)}${line(480, 712, 638, 769, ink, 22)}${line(480, 712, 480, 794, ink, 22)}
      ${circle(314, 782, 25, ink)}${circle(645, 782, 25, ink)}${circle(480, 806, 25, ink)}
      ${rect(321, 186, 318, 346, c, 58)}${rect(352, 215, 256, 246, light, 37)}${line(480, 471, 480, 554, ink, 24)}
      ${ellipse(480, 581, 211, 62, ink)}${ellipse(480, 562, 211, 57, c)}${path('M310 554V455H278M650 554V455H682', 'none', `stroke="${ink}" stroke-width="18" stroke-linecap="round"`)}
      ${rect(238, 441, 113, 26, ink, 13)}${rect(609, 441, 113, 26, ink, 13)}${line(480, 261, 480, 425, c, 5)}`,
  },
  {
    title: 'Cafeteira elétrica',
    art: (
      c,
      light,
    ) => `${rect(291, 198, 373, 107, ink, 29)}${rect(291, 269, 113, 407, c, 20)}${rect(291, 642, 373, 69, ink, 15)}${rect(404, 287, 236, 96, c, 13)}
      ${rect(346, 225, 260, 20, light, 9)}${circle(354, 584, 23, light)}${circle(354, 584, 10, c)}
      ${path('M427 410H606L628 590Q628 620 595 620H431Q405 620 409 590Z', light, `fill-opacity="0.65" stroke="${ink}" stroke-width="9"`)}
      ${path('M418 526H619L628 590Q628 620 595 620H431Q405 620 409 590Z', '#704c37')}${rect(426, 393, 182, 25, ink, 8)}
      ${path('M623 437H662Q695 437 695 475V530Q695 567 656 567H628', 'none', `stroke="${ink}" stroke-width="19"`)}${line(436, 437, 436, 491, cream, 10)}${ellipse(515, 676, 124, 13, '#596d7c')}`,
  },
  {
    title: 'Liquidificador',
    art: (
      c,
      light,
    ) => `${path('M326 260H616L581 546H361Z', light, `fill-opacity="0.7" stroke="${ink}" stroke-width="9"`)}
      ${path('M351 406H597L581 546H361Z', '#f2ad82', 'fill-opacity="0.7"')}${line(385, 308, 385, 464, cream, 10)}
      ${path('M616 291H655Q690 291 685 338L671 428Q665 458 600 455', 'none', `stroke="${ink}" stroke-width="17"`)}
      ${rect(310, 229, 322, 41, ink, 15)}${rect(420, 211, 103, 25, c, 10)}${rect(378, 540, 184, 47, ink, 10)}
      ${path('M353 578H589L624 695Q629 726 602 733H340Q313 726 318 695Z', c)}${circle(471, 659, 48, ink)}${circle(471, 659, 31, light)}${line(471, 659, 481, 638, ink, 6)}
      ${line(519, 335, 560, 335, ink, 5)}${line(519, 368, 546, 368, ink, 5)}${line(519, 402, 560, 402, ink, 5)}`,
  },
  {
    title: 'Mochila urbana',
    art: (
      c,
      light,
    ) => `${path('M398 237V202Q398 169 434 169H524Q560 169 560 202V237', 'none', `stroke="${ink}" stroke-width="23"`)}
      ${path('M333 288Q228 314 253 635M626 288Q731 314 706 635', 'none', `stroke="${ink}" stroke-width="25"`)}
      ${path('M316 349Q316 232 432 232H528Q644 232 644 349V688Q644 732 600 732H360Q316 732 316 688Z', c)}
      ${path('M337 354Q337 256 431 256H528Q622 256 622 354', 'none', `stroke="${light}" stroke-width="8"`)}
      ${rect(349, 468, 262, 203, light, 27)}${line(369, 504, 591, 504, ink, 7)}${line(582, 504, 582, 531, ink, 6)}
      ${rect(407, 356, 146, 44, cream, 13)}${rect(278, 473, 56, 134, ink, 15)}${rect(626, 473, 56, 134, ink, 15)}${line(349, 706, 610, 706, ink, 6)}`,
  },
  {
    title: 'Jaqueta jeans',
    art: (
      c,
      light,
    ) => `${path('M365 221L284 249L173 555L267 596L320 455V729H640V455L693 596L787 555L676 249L595 221Z', c, `stroke="${ink}" stroke-width="8"`)}
      ${path('M365 221L480 283L595 221L549 330L480 283L411 330Z', light, `stroke="${ink}" stroke-width="6"`)}
      ${line(480, 295, 480, 729, light, 13)}${rect(347, 354, 99, 91, light, 8)}${rect(514, 354, 99, 91, light, 8)}${path('M346 354L396 385L446 354M514 354L564 385L614 354', 'none', `stroke="${ink}" stroke-width="5"`)}
      ${[360, 420, 480, 540, 600, 660].map((y) => circle(488, y, 7, ink)).join('')}${line(339, 698, 621, 698, light, 7)}${line(203, 535, 270, 563, light, 7)}${line(690, 563, 757, 535, light, 7)}`,
  },
  {
    title: 'Espelho de maquiagem',
    art: (
      c,
      light,
    ) => `${ellipse(480, 741, 166, 31, ink)}${ellipse(480, 731, 160, 24, c)}${rect(460, 558, 40, 170, c, 8)}
      ${circle(480, 378, 204, ink)}${circle(480, 378, 188, c)}${circle(480, 378, 165, '#dbeaf0')}
      ${path('M347 421L482 216Q516 216 548 231L384 491Q363 462 347 421Z', cream, 'fill-opacity="0.8"')}
      ${path('M467 535L604 303Q627 350 624 390L548 519Z', cream, 'fill-opacity="0.5"')}${circle(278, 379, 17, c)}${circle(682, 379, 17, c)}
      ${path('M278 379V578Q278 625 480 625Q682 625 682 578V379', 'none', `stroke="${c}" stroke-width="15"`)}${line(432, 731, 528, 731, light, 6)}`,
  },
  {
    title: 'Nécessaire organizadora',
    art: (
      c,
      light,
    ) => `${path('M235 406Q235 330 311 321L642 289Q703 285 719 346L761 648Q766 693 718 703L292 742Q252 745 246 699Z', c, `stroke="${ink}" stroke-width="7"`)}
      ${path('M237 408L720 356L731 398L244 451Z', light)}${line(270, 413, 690, 369, ink, 8)}${rect(631, 373, 29, 72, ink, 8, 'transform="rotate(-6 646 409)"')}
      ${rect(385, 485, 226, 150, light, 22, 'transform="rotate(-6 498 560)"')}${path('M681 310L745 267Q773 250 782 277Q789 299 756 317L702 350', 'none', `stroke="${ink}" stroke-width="13"`)}
      ${line(285, 709, 704, 670, light, 7)}${circle(343, 581, 9, cream)}${circle(657, 551, 9, cream)}`,
  },
  {
    title: 'Bicicleta urbana',
    art: (
      c,
      light,
    ) => `${[263, 702].map((x) => `${circle(x, 609, 133, cream, `stroke="${ink}" stroke-width="15"`)}${circle(x, 609, 114, 'none', 'stroke="#a4b3bc" stroke-width="5"')}${[0, 1, 2, 3, 4, 5].map((i) => group(`rotate(${i * 30} ${x} 609)`, line(x - 110, 609, x + 110, 609, '#b2c0c7', 3))).join('')}${circle(x, 609, 14, ink)}`).join('')}
      ${path('M263 609L380 388L476 609H263L568 434L476 609M380 388H587M568 434L702 609', 'none', `stroke="${c}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"`)}
      ${line(570, 388, 702, 609, ink, 11)}${line(587, 388, 611, 299, ink, 12)}${line(611, 299, 667, 299, ink, 12)}${line(380, 388, 363, 333, ink, 14)}${rect(318, 318, 111, 25, ink, 13)}
      ${path('M653 351H758L744 417H667Z', light, `stroke="${ink}" stroke-width="5"`)}${line(674, 369, 739, 369, ink, 4)}${line(679, 386, 736, 386, ink, 4)}
      ${circle(476, 609, 34, ink)}${line(476, 609, 524, 638, ink, 10)}${line(514, 640, 548, 640, ink, 8)}`,
  },
  {
    title: 'Conjunto de halteres',
    art: (c, light) =>
      `${[
        [-16, 440, 365],
        [17, 504, 607],
      ]
        .map(([angle, x, y]) =>
          group(
            `translate(${x - 270} ${y - 82}) rotate(${angle} 270 82)`,
            `${rect(118, 60, 305, 44, ink, 10)}${path('M44 9H153L190 82L153 155H44L7 82Z', c, `stroke="${ink}" stroke-width="7"`)}${path('M387 9H496L533 82L496 155H387L350 82Z', c, `stroke="${ink}" stroke-width="7"`)}${path('M69 32H132L158 82L132 131H69L43 82Z', light)}${path('M413 32H476L502 82L476 131H413L387 82Z', light)}${line(221, 72, 316, 72, '#718591', 5)}${line(221, 90, 316, 90, '#718591', 5)}`,
          ),
        )
        .join('')}`,
  },
  {
    title: 'Jogo de tabuleiro',
    art: (c, light) => `${rect(191, 249, 554, 449, ink, 20)}${rect(208, 265, 520, 417, cream, 9)}
      ${Array.from({ length: 5 }, (_, row) => Array.from({ length: 6 }, (_, col) => rect(220 + col * 83, 278 + row * 78, 77, 72, (row + col) % 2 === 0 ? light : '#f3d7a5', 2)).join('')).join('')}
      ${[
        [273, 342, c],
        [441, 500, '#d57879'],
        [612, 580, '#649c85'],
      ]
        .map(
          ([x, y, color]) =>
            `${ellipse(x, y + 17, 31, 12, ink)}${path(`M${x - 20} ${y + 11}L${x - 13} ${y - 20}H${x + 13}L${x + 20} ${y + 11}Z`, color)}${circle(x, y - 28, 18, color)}`,
        )
        .join('')}
      ${group('rotate(14 760 708)', `${rect(714, 661, 97, 97, cream, 19, `stroke="${ink}" stroke-width="6"`)}${circle(740, 688, 8, ink)}${circle(785, 688, 8, ink)}${circle(763, 710, 8, ink)}${circle(740, 732, 8, ink)}${circle(785, 732, 8, ink)}`)}`,
  },
  {
    title: 'Blocos de montar',
    art: (c, light) =>
      `${[
        [214, 554, 326, 129, c],
        [437, 425, 267, 129, '#e5a25f'],
        [278, 299, 315, 126, light],
        [567, 584, 187, 99, '#9aae80'],
      ]
        .map(
          ([x, y, w, h, color]) =>
            `${rect(x, y, w, h, color, 9, `stroke="${ink}" stroke-width="5"`)}${path(`M${x + w} ${y}l27 -25V${y + h - 25}l-27 25Z`, color, 'filter="brightness(0.9)"')}${path(`M${x} ${y}l27 -25H${x + w + 27}l-27 25Z`, color)}${Array.from({ length: Math.floor(w / 68) }, (_, i) => `${rect(x + 28 + i * 66, y - 30, 44, 22, color, 3)}${ellipse(x + 50 + i * 66, y - 30, 22, 8, cream, 'fill-opacity="0.55"')}`).join('')}`,
        )
        .join('')}`,
  },
  {
    title: 'Coleção de livros de ficção',
    art: (c, light) =>
      `${[
        [237, 303, 77, 406, c],
        [321, 236, 91, 473, '#c88360'],
        [419, 274, 90, 435, '#90aa89'],
        [516, 215, 99, 494, light],
        [622, 309, 80, 400, '#ad96c7'],
      ]
        .map(
          ([x, y, w, h, color]) =>
            `${rect(x, y, w, h, color, 8, `stroke="${ink}" stroke-width="4"`)}${rect(x + 13, y + 24, w - 26, 10, cream, 3)}${rect(x + 13, y + h - 32, w - 26, 10, cream, 3)}${rect(x + 20, y + 70, w - 40, 93, cream, 4, 'fill-opacity="0.75"')}${line(x + 9, y + 10, x + 9, y + h - 10, ink, 3, 'opacity="0.2"')}`,
        )
        .join('')}${rect(210, 709, 520, 22, '#8b623f', 5)}`,
  },
  {
    title: 'Kit de cadernos',
    art: (c, light) =>
      `${[
        [12, 299, 243, '#d49b73'],
        [-9, 387, 283, light],
        [3, 228, 360, c],
      ]
        .map(([angle, x, y, color]) =>
          group(
            `rotate(${angle} ${x + 154} ${y + 173})`,
            `${rect(x + 7, y + 7, 313, 356, '#c2c8c8', 15)}${rect(x, y, 308, 350, color, 13, `stroke="${ink}" stroke-width="5"`)}${rect(x + 80, y + 71, 148, 97, cream, 7)}${line(x + 102, y + 103, x + 206, y + 103, '#bac2c5', 4)}${line(x + 102, y + 124, x + 186, y + 124, '#bac2c5', 4)}${Array.from({ length: 10 }, (_, i) => `${circle(x + 20, y + 25 + i * 32, 5, ink)}${path(`M${x + 20} ${y + 25 + i * 32}C${x - 22} ${y + 10 + i * 32},${x - 22} ${y + 47 + i * 32},${x + 20} ${y + 43 + i * 32}`, 'none', `stroke="${ink}" stroke-width="5"`)}`).join('')}`,
          ),
        )
        .join('')}`,
  },
  {
    title: 'Kit de ferramentas manuais',
    art: (
      c,
      light,
    ) => `${path('M374 300V255Q374 228 403 228H557Q586 228 586 255V300', 'none', `stroke="${ink}" stroke-width="25"`)}${rect(188, 294, 584, 407, ink, 27)}${rect(211, 318, 538, 359, light, 16)}${rect(210, 494, 540, 23, c, 5)}
      ${group('rotate(-12 326 497)', `${rect(299, 414, 37, 213, '#b38659', 8)}${path('M264 367H367L398 392L372 417H335V450H299V417H264Z', ink)}${line(281, 386, 362, 386, '#8195a2', 7)}`)}
      ${group('rotate(11 623 494)', `${path('M598 405L577 356L595 338L620 378L644 338L662 356L641 405L662 466L636 479L620 439L603 479L577 466Z', ink)}${line(598, 459, 584, 603, c, 22)}${line(642, 459, 656, 603, c, 22)}${circle(620, 408, 11, '#8ca0ab')}`)}
      ${rect(444, 496, 46, 133, c, 15)}${rect(458, 354, 18, 162, ink, 4)}${rect(456, 339, 22, 25, '#839aa6', 1)}${rect(249, 290, 82, 28, c, 6)}${rect(629, 290, 82, 28, c, 6)}`,
  },
  {
    title: 'Regador de jardim',
    art: (
      c,
      light,
    ) => `${path('M280 345Q142 263 137 452Q137 571 295 600', 'none', `stroke="${ink}" stroke-width="38"`)}${path('M280 345Q142 263 137 452Q137 571 295 600', 'none', `stroke="${light}" stroke-width="23"`)}
      ${path('M531 499L722 383L751 423L576 625Z', c, `stroke="${ink}" stroke-width="7"`)}${group('rotate(-32 752 385)', `${rect(711, 330, 84, 104, ink, 22)}${ellipse(784, 382, 20, 47, light)}${[351, 370, 390, 410].map((y) => circle(785, y, 4, ink)).join('')}`)}
      ${rect(263, 333, 329, 356, c, 39)}${ellipse(428, 335, 163, 49, light)}${ellipse(428, 337, 117, 31, ink)}${ellipse(428, 675, 162, 32, c)}${line(308, 400, 308, 628, light, 11)}
      ${path('M382 528Q427 468 473 528Q451 580 428 600Q405 580 382 528Z', light)}${line(428, 515, 428, 590, c, 5)}`,
  },
  {
    title: 'Cama para pet',
    art: (
      c,
      light,
    ) => `${ellipse(480, 586, 309, 171, ink)}${ellipse(480, 560, 304, 168, c)}${ellipse(480, 552, 245, 123, light)}${ellipse(480, 559, 216, 99, cream)}
      ${path('M210 591Q477 773 750 591', 'none', `stroke="${light}" stroke-width="21"`)}${path('M271 571Q466 410 693 571M276 607Q480 451 687 607', 'none', 'stroke="#dddcd2" stroke-width="4"')}
      ${ellipse(480, 563, 34, 28, c)}${circle(439, 525, 14, c)}${circle(466, 512, 14, c)}${circle(495, 512, 14, c)}${circle(521, 526, 14, c)}
      ${line(315, 657, 307, 699, light, 5)}${line(647, 657, 655, 699, light, 5)}${line(480, 682, 480, 724, light, 5)}`,
  },
  {
    title: 'Caixa de transporte para pet',
    art: (
      c,
      light,
    ) => `${path('M212 361L324 294H696Q747 294 767 346L811 585L706 713H280Q233 713 227 660Z', c, `stroke="${ink}" stroke-width="7"`)}
      ${path('M212 361H596Q655 361 665 416L706 713H280Q233 713 227 660Z', light)}${path('M212 361L324 294H696L596 361Z', cream)}
      ${path('M411 302V267Q411 243 436 243H538Q563 243 563 267V302', 'none', `stroke="${ink}" stroke-width="19"`)}
      ${path('M263 419H561L600 663H286Z', ink)}${path('M283 439H545L577 642H303Z', '#839ba7')}
      ${Array.from({ length: 7 }, (_, i) => line(303 + i * 35, 448, 317 + i * 38, 631, '#dce6e8', 6)).join('')}${line(289, 499, 553, 499, '#dce6e8', 6)}${line(297, 555, 562, 555, '#dce6e8', 6)}${line(306, 611, 572, 611, '#dce6e8', 6)}
      ${[0, 1, 2, 3].map((i) => rect(685 + i * 20, 385, 10, 113, ink, 5, `transform="rotate(-9 ${690 + i * 20} 440)"`)).join('')}${rect(578, 531, 28, 54, cream, 9)}${line(670, 565, 786, 554, ink, 7)}`,
  },
  {
    title: 'Kit de artesanato',
    art: (c, light) => `${[
      [274, 396, c],
      [449, 510, '#cd9671'],
      [624, 358, '#86a88b'],
    ]
      .map(
        ([x, y, color]) =>
          `${rect(x - 35, y - 60, 70, 213, '#b59770', 5)}${rect(x - 65, y - 31, 130, 151, color, 24)}${ellipse(x, y - 31, 65, 23, light)}${ellipse(x, y + 120, 65, 23, color)}${line(x - 61, y + 1, x + 62, y + 1, cream, 3, 'opacity="0.55"')}${line(x - 65, y + 28, x + 65, y + 28, cream, 3, 'opacity="0.55"')}${line(x - 65, y + 55, x + 65, y + 55, cream, 3, 'opacity="0.55"')}${line(x - 62, y + 82, x + 62, y + 82, cream, 3, 'opacity="0.55"')}`,
      )
      .join('')}
      ${group('rotate(-20 657 682)', `${ellipse(612, 697, 32, 43, 'none', `stroke="${ink}" stroke-width="15"`)}${ellipse(703, 697, 32, 43, 'none', `stroke="${ink}" stroke-width="15"`)}${path('M627 662L689 512L663 665L614 529L688 662', 'none', 'stroke="#849aa7" stroke-width="17" stroke-linecap="round"')}${circle(657, 640, 13, ink)}`)}
      ${path('M278 549C290 672 369 650 402 695C450 754 553 725 550 670', 'none', `stroke="${c}" stroke-width="7" stroke-linecap="round"`)}${group('rotate(-16 224 681)', `${rect(205, 592, 30, 175, '#d7ae66', 6)}${path('M205 592L220 556L235 592Z', ink)}`)}`,
  },
  {
    title: 'Coleção de chaveiros',
    art: (c, light) =>
      `${[
        [286, 283, c, 'round'],
        [487, 391, '#cb9472', 'star'],
        [702, 263, '#89a58e', 'square'],
      ]
        .map(
          ([x, y, color, shape]) =>
            `${circle(x, y, 54, 'none', `stroke="${ink}" stroke-width="13"`)}${circle(x, y, 39, 'none', 'stroke="#a7b7bf" stroke-width="5"')}${line(x, y + 54, x, y + 108, '#8a9fa9', 12)}${circle(x, y + 101, 14, 'none', `stroke="${ink}" stroke-width="6"`)}${shape === 'round' ? `${circle(x, y + 193, 89, color)}${circle(x, y + 193, 61, light)}${path(`M${x - 27} ${y + 183}L${x - 5} ${y + 206}L${x + 36} ${y + 163}`, 'none', `stroke="${color}" stroke-width="13" stroke-linecap="round"`)}` : shape === 'star' ? `${path(`M${x} ${y + 120}L${x + 28} ${y + 176}L${x + 89} ${y + 185}L${x + 44} ${y + 230}L${x + 54} ${y + 291}L${x} ${y + 262}L${x - 54} ${y + 291}L${x - 44} ${y + 230}L${x - 89} ${y + 185}L${x - 28} ${y + 176}Z`, color)}` : `${rect(x - 76, y + 120, 152, 185, color, 29)}${rect(x - 51, y + 146, 102, 133, light, 19)}${path(`M${x} ${y + 175}L${x + 30} ${y + 210}L${x} ${y + 245}L${x - 30} ${y + 210}Z`, color)}`}`,
        )
        .join('')}`,
  },
];

function illustration(product, index) {
  const [background, color, light] = palettes[index % palettes.length];
  const label = product.title.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Ilustração demonstrativa: ${label}">
    <defs><linearGradient id="background" x2="0.9" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="${cream}"/></linearGradient></defs>
    ${rect(0, 0, SIZE, SIZE, 'url(#background)', 0)}
    ${circle(739, 277, 180, cream, 'fill-opacity="0.45"')}${circle(164, 639, 125, light, 'fill-opacity="0.12"')}
    ${ellipse(480, 790, 281, 27, ink, 'fill-opacity="0.08"')}
    <g stroke-linejoin="round">${product.art(color, light)}</g>
    <text x="869" y="90" text-anchor="end" font-family="Arial, sans-serif" font-size="21" font-weight="600" letter-spacing="3" fill="${ink}" opacity="0.5">EXEMPLO</text>
    ${line(778, 112, 867, 112, color, 3, 'opacity="0.3"')}
    </svg>`;
}

await mkdir(target, { recursive: true });
for (const [index, product] of products.entries()) {
  const name = `product-${String(index + 1).padStart(2, '0')}.png`;
  const png = await sharp(Buffer.from(illustration(product, index)))
    .png()
    .toBuffer();
  await writeFile(new URL(name, target), png);
  process.stdout.write(`${name}: ${png.length} bytes — ${product.title}\n`);
}
process.stdout.write(`30 ilustrações próprias geradas em ${fileURLToPath(target)}\n`);
