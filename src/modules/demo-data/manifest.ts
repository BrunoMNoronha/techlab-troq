import type { ProductCategoryCode } from '@/modules/listing';

/** Identidade do catálogo; uma nova composição exige uma nova versão. */
export const DEMO_DATASET_VERSION = 'products-v1';

export interface DemoProduct {
  key: string;
  title: string;
  description: string;
  category: ProductCategoryCode;
  city: string;
  uf: string;
  tradeOptions: [string, string, string];
  /** Arquivo local autorizado; nunca recebido do cliente. */
  assetPath: string;
}

/** Dados inteiramente sintéticos, sem marcas, contatos ou endereços pessoais. */
export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    key: 'product-01',
    title: 'Smartphone 128 GB',
    description:
      'Celular com tela de seis polegadas, armazenamento de 128 GB e capa protetora. Exemplar fictício, usado somente para demonstração da vitrine.',
    category: 'celulares',
    city: 'Brasília',
    uf: 'DF',
    tradeOptions: ['Tablet compacto', 'Caixa de som portátil', 'Fone sem fio'],
    assetPath: 'public/demo-products/product-01.png',
  },
  {
    key: 'product-02',
    title: 'Suporte de mesa para celular',
    description:
      'Suporte dobrável com apoio antiderrapante e inclinação ajustável para uso sobre a mesa. Produto exemplar fictício para demonstração.',
    category: 'celulares',
    city: 'Goiânia',
    uf: 'GO',
    tradeOptions: ['Suporte para tablet', 'Mouse USB', 'Organizador de mesa'],
    assetPath: 'public/demo-products/product-02.png',
  },
  {
    key: 'product-03',
    title: 'Notebook de 14 polegadas',
    description:
      'Notebook leve com tela de 14 polegadas, teclado completo e carregador. Cadastro sintético para testar navegação e filtros de informática.',
    category: 'informatica',
    city: 'São Paulo',
    uf: 'SP',
    tradeOptions: ['Tablet com teclado', 'Monitor de computador', 'Bicicleta urbana'],
    assetPath: 'public/demo-products/product-03.png',
  },
  {
    key: 'product-04',
    title: 'Teclado USB',
    description:
      'Teclado de mesa com conexão USB, teclas silenciosas e apoio ajustável. Exemplar fictício para demonstração do catálogo.',
    category: 'informatica',
    city: 'Campinas',
    uf: 'SP',
    tradeOptions: ['Mouse óptico', 'Webcam', 'Fone com microfone'],
    assetPath: 'public/demo-products/product-04.png',
  },
  {
    key: 'product-05',
    title: 'Caixa de som Bluetooth',
    description:
      'Caixa de som portátil com alça, conexão sem fio e bateria recarregável. Produto sintético para demonstração, sem marca comercial.',
    category: 'eletronicos',
    city: 'Belo Horizonte',
    uf: 'MG',
    tradeOptions: ['Fone Bluetooth', 'Rádio portátil', 'Mochila urbana'],
    assetPath: 'public/demo-products/product-05.png',
  },
  {
    key: 'product-06',
    title: 'Rádio portátil',
    description:
      'Rádio de mesa com antena retrátil, alça e seletor de estações. Exemplar fictício para testar os anúncios de áudio e vídeo.',
    category: 'eletronicos',
    city: 'Vitória',
    uf: 'ES',
    tradeOptions: ['Caixa de som', 'Luminária de mesa', 'Coleção de livros'],
    assetPath: 'public/demo-products/product-06.png',
  },
  {
    key: 'product-07',
    title: 'Fone Bluetooth',
    description:
      'Fone sem fio com arco ajustável, almofadas macias e estojo para guardar. Dados e ilustração sintéticos para demonstração.',
    category: 'eletronicos',
    city: 'Curitiba',
    uf: 'PR',
    tradeOptions: ['Teclado USB', 'Controle de videogame', 'Caixa de som portátil'],
    assetPath: 'public/demo-products/product-07.png',
  },
  {
    key: 'product-08',
    title: 'Console de videogame',
    description:
      'Console compacto acompanhado de controle e cabos para uso na televisão. Cadastro demonstrativo fictício, sem associação a fabricante.',
    category: 'games',
    city: 'Florianópolis',
    uf: 'SC',
    tradeOptions: ['Tablet', 'Bicicleta urbana', 'Notebook compacto'],
    assetPath: 'public/demo-products/product-08.png',
  },
  {
    key: 'product-09',
    title: 'Controle de videogame',
    description:
      'Controle com dois direcionais analógicos e botões coloridos para jogos. Exemplar sintético para demonstração dos filtros de games.',
    category: 'games',
    city: 'Porto Alegre',
    uf: 'RS',
    tradeOptions: ['Fone com microfone', 'Teclado USB', 'Jogo de tabuleiro'],
    assetPath: 'public/demo-products/product-09.png',
  },
  {
    key: 'product-10',
    title: 'Mesa de apoio de madeira',
    description:
      'Mesa de apoio redonda com pés de madeira e acabamento natural, adequada para pequenos espaços. Produto fictício para demonstração.',
    category: 'casa',
    city: 'Rio de Janeiro',
    uf: 'RJ',
    tradeOptions: ['Luminária de mesa', 'Estante pequena', 'Cadeira de escritório'],
    assetPath: 'public/demo-products/product-10.png',
  },
  {
    key: 'product-11',
    title: 'Luminária de mesa',
    description:
      'Luminária de mesa com haste articulada, base firme e cúpula direcionável. Cadastro sintético para apresentar os itens de casa e decoração.',
    category: 'casa',
    city: 'Niterói',
    uf: 'RJ',
    tradeOptions: ['Organizador de mesa', 'Vaso decorativo', 'Kit de cadernos'],
    assetPath: 'public/demo-products/product-11.png',
  },
  {
    key: 'product-12',
    title: 'Cadeira de escritório',
    description:
      'Cadeira com encosto acolchoado, apoio para braços e base com rodízios. Exemplar fictício para demonstração da categoria de móveis.',
    category: 'casa',
    city: 'Recife',
    uf: 'PE',
    tradeOptions: ['Mesa de apoio', 'Monitor de computador', 'Estante pequena'],
    assetPath: 'public/demo-products/product-12.png',
  },
  {
    key: 'product-13',
    title: 'Cafeteira elétrica',
    description:
      'Cafeteira de filtro com jarra de vidro, reservatório e base de apoio. Dados sintéticos para demonstração de eletrodomésticos.',
    category: 'eletrodomesticos',
    city: 'Salvador',
    uf: 'BA',
    tradeOptions: ['Liquidificador', 'Chaleira elétrica', 'Conjunto de xícaras'],
    assetPath: 'public/demo-products/product-13.png',
  },
  {
    key: 'product-14',
    title: 'Liquidificador',
    description:
      'Liquidificador com jarra transparente, tampa removível e seletor de velocidades. Produto fictício para demonstração da vitrine.',
    category: 'eletrodomesticos',
    city: 'Fortaleza',
    uf: 'CE',
    tradeOptions: ['Cafeteira elétrica', 'Sanduicheira', 'Kit de utensílios de cozinha'],
    assetPath: 'public/demo-products/product-14.png',
  },
  {
    key: 'product-15',
    title: 'Mochila urbana',
    description:
      'Mochila com compartimento principal, bolso frontal e alças acolchoadas para uso cotidiano. Exemplar fictício de moda e acessórios.',
    category: 'moda',
    city: 'Natal',
    uf: 'RN',
    tradeOptions: ['Bolsa de tecido', 'Jaqueta jeans', 'Tênis casual'],
    assetPath: 'public/demo-products/product-15.png',
  },
  {
    key: 'product-16',
    title: 'Jaqueta jeans',
    description:
      'Jaqueta jeans de corte reto com bolsos frontais e fechamento por botões. Cadastro sintético, sem marca, para testar a categoria de moda.',
    category: 'moda',
    city: 'João Pessoa',
    uf: 'PB',
    tradeOptions: ['Mochila urbana', 'Camisa de algodão', 'Bolsa casual'],
    assetPath: 'public/demo-products/product-16.png',
  },
  {
    key: 'product-17',
    title: 'Espelho de maquiagem',
    description:
      'Espelho redondo com suporte de mesa, base estável e inclinação ajustável. Produto exemplar fictício para demonstração.',
    category: 'beleza',
    city: 'Maceió',
    uf: 'AL',
    tradeOptions: ['Nécessaire organizadora', 'Organizador de acessórios', 'Luminária compacta'],
    assetPath: 'public/demo-products/product-17.png',
  },
  {
    key: 'product-18',
    title: 'Nécessaire organizadora',
    description:
      'Nécessaire de tecido com zíper e divisórias para organizar pequenos objetos. Dados inteiramente sintéticos para demonstração.',
    category: 'beleza',
    city: 'Aracaju',
    uf: 'SE',
    tradeOptions: ['Espelho de mesa', 'Estojo de tecido', 'Bolsa pequena'],
    assetPath: 'public/demo-products/product-18.png',
  },
  {
    key: 'product-19',
    title: 'Bicicleta urbana',
    description:
      'Bicicleta urbana com quadro leve, cestinha frontal e guidão confortável. Exemplar fictício para testar a navegação de esportes e lazer.',
    category: 'esportes',
    city: 'Manaus',
    uf: 'AM',
    tradeOptions: ['Console de videogame', 'Notebook compacto', 'Kit de camping'],
    assetPath: 'public/demo-products/product-19.png',
  },
  {
    key: 'product-20',
    title: 'Conjunto de halteres',
    description:
      'Par de halteres com revestimento emborrachado e formato hexagonal para exercícios. Cadastro demonstrativo sintético.',
    category: 'esportes',
    city: 'Belém',
    uf: 'PA',
    tradeOptions: ['Colchonete de exercícios', 'Bola de pilates', 'Faixas elásticas'],
    assetPath: 'public/demo-products/product-20.png',
  },
  {
    key: 'product-21',
    title: 'Jogo de tabuleiro',
    description:
      'Jogo de tabuleiro ilustrado acompanhado de peças coloridas e dados. Exemplar fictício para demonstrar os anúncios de brinquedos e jogos.',
    category: 'brinquedos',
    city: 'São Luís',
    uf: 'MA',
    tradeOptions: ['Blocos de montar', 'Quebra-cabeça', 'Coleção de livros'],
    assetPath: 'public/demo-products/product-21.png',
  },
  {
    key: 'product-22',
    title: 'Blocos de montar',
    description:
      'Conjunto de blocos coloridos de encaixe com formas variadas para montar construções. Produto fictício sem marca comercial.',
    category: 'brinquedos',
    city: 'Teresina',
    uf: 'PI',
    tradeOptions: ['Jogo de tabuleiro', 'Quebra-cabeça', 'Kit de desenho'],
    assetPath: 'public/demo-products/product-22.png',
  },
  {
    key: 'product-23',
    title: 'Coleção de livros de ficção',
    description:
      'Conjunto de cinco livros de ficção com capas coloridas, representados por ilustração própria. Cadastro inteiramente sintético para demonstração.',
    category: 'livros',
    city: 'Palmas',
    uf: 'TO',
    tradeOptions: ['Jogo de tabuleiro', 'Kit de cadernos', 'Luminária de leitura'],
    assetPath: 'public/demo-products/product-23.png',
  },
  {
    key: 'product-24',
    title: 'Kit de cadernos',
    description:
      'Kit de três cadernos com espiral, capas lisas e folhas pautadas para estudo. Produto exemplar fictício de papelaria.',
    category: 'livros',
    city: 'Boa Vista',
    uf: 'RR',
    tradeOptions: ['Kit de canetas', 'Estojo escolar', 'Livros de ficção'],
    assetPath: 'public/demo-products/product-24.png',
  },
  {
    key: 'product-25',
    title: 'Kit de ferramentas manuais',
    description:
      'Maleta com martelo, alicate e chaves manuais para pequenos reparos. Exemplar fictício para testar a categoria de ferramentas.',
    category: 'ferramentas',
    city: 'Cuiabá',
    uf: 'MT',
    tradeOptions: ['Regador de jardim', 'Organizador de ferramentas', 'Kit de jardinagem'],
    assetPath: 'public/demo-products/product-25.png',
  },
  {
    key: 'product-26',
    title: 'Regador de jardim',
    description:
      'Regador com alça larga e bico removível para cuidar de vasos e pequenas plantas. Cadastro demonstrativo sintético.',
    category: 'ferramentas',
    city: 'Campo Grande',
    uf: 'MS',
    tradeOptions: ['Kit de jardinagem', 'Conjunto de vasos', 'Ferramentas manuais'],
    assetPath: 'public/demo-products/product-26.png',
  },
  {
    key: 'product-27',
    title: 'Cama para pet',
    description:
      'Cama oval com bordas acolchoadas, almofada central e capa lavável para pet. Produto fictício para demonstração de acessórios.',
    category: 'pets',
    city: 'Porto Velho',
    uf: 'RO',
    tradeOptions: ['Caixa de transporte para pet', 'Arranhador', 'Kit de brinquedos para pet'],
    assetPath: 'public/demo-products/product-27.png',
  },
  {
    key: 'product-28',
    title: 'Caixa de transporte para pet',
    description:
      'Caixa de transporte com alça, aberturas laterais e porta frontal com grade. Exemplar fictício para testar os anúncios de acessórios para pets.',
    category: 'pets',
    city: 'Rio Branco',
    uf: 'AC',
    tradeOptions: ['Cama para pet', 'Bebedouro para pet', 'Arranhador'],
    assetPath: 'public/demo-products/product-28.png',
  },
  {
    key: 'product-29',
    title: 'Kit de artesanato',
    description:
      'Kit com linhas coloridas, tesoura de ponta arredondada e pequenos materiais para artesanato. Dados sintéticos para demonstração do catálogo.',
    category: 'outros',
    city: 'Macapá',
    uf: 'AP',
    tradeOptions: ['Kit de desenho', 'Cadernos', 'Organizador de materiais'],
    assetPath: 'public/demo-products/product-29.png',
  },
  {
    key: 'product-30',
    title: 'Coleção de chaveiros',
    description:
      'Conjunto de chaveiros decorativos com formas geométricas e argolas metálicas. Produto fictício com ilustração própria para demonstração.',
    category: 'outros',
    city: 'Santos',
    uf: 'SP',
    tradeOptions: ['Kit de adesivos', 'Estojo pequeno', 'Materiais de artesanato'],
    assetPath: 'public/demo-products/product-30.png',
  },
];
