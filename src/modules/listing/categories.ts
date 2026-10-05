// Catalogo comercial de #89; docs/product/product-categories.md.
// Compartilhado entre servidor, formulario e apresentacao publica.
export const PRODUCT_CATEGORIES = [
  { code: 'celulares', label: 'Celulares e acessórios' },
  { code: 'informatica', label: 'Informática' },
  { code: 'eletronicos', label: 'Eletrônicos, áudio e vídeo' },
  { code: 'games', label: 'Games e consoles' },
  { code: 'casa', label: 'Casa, móveis e decoração' },
  { code: 'eletrodomesticos', label: 'Eletrodomésticos' },
  { code: 'moda', label: 'Moda e acessórios' },
  { code: 'beleza', label: 'Beleza e cuidados pessoais' },
  { code: 'esportes', label: 'Esportes e lazer' },
  { code: 'brinquedos', label: 'Brinquedos e jogos' },
  { code: 'livros', label: 'Livros e papelaria' },
  { code: 'ferramentas', label: 'Ferramentas e jardim' },
  { code: 'pets', label: 'Acessórios para pets' },
  { code: 'outros', label: 'Outros' },
] as const;

export type ProductCategoryCode = (typeof PRODUCT_CATEGORIES)[number]['code'];

export function isProductCategory(value: string): value is ProductCategoryCode {
  return PRODUCT_CATEGORIES.some((category) => category.code === value);
}

export function productCategoryLabel(value: string | null | undefined): string {
  return (
    PRODUCT_CATEGORIES.find((category) => category.code === value)?.label ??
    'Categoria não informada'
  );
}
