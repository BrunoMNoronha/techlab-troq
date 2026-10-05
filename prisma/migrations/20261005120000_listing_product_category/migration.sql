-- #89: legados permanecem NULL, sem backfill nem alteracao de estado.
ALTER TABLE "listings" ADD COLUMN "category" VARCHAR(40);
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_valid" CHECK (
  "category" IS NULL OR "category" IN (
    'celulares', 'informatica', 'eletronicos', 'games', 'casa',
    'eletrodomesticos', 'moda', 'beleza', 'esportes', 'brinquedos',
    'livros', 'ferramentas', 'pets', 'outros'
  )
);
