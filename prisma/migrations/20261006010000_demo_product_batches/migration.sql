-- #201: procedencia sintetica aditiva. Nenhuma FK/historico existente muda.
CREATE TABLE "demo_datasets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "environment" VARCHAR(20) NOT NULL,
  "database_fingerprint" CHAR(64) NOT NULL,
  "media_fingerprint" CHAR(64) NOT NULL,
  "owner_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demo_datasets_environment_check" CHECK ("environment" IN ('development', 'preview')),
  CONSTRAINT "demo_datasets_known_set_check" CHECK ("id" = 'products'),
  CONSTRAINT "demo_datasets_database_fingerprint_check" CHECK ("database_fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "demo_datasets_media_fingerprint_check" CHECK ("media_fingerprint" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "demo_datasets_owner_id_key" ON "demo_datasets"("owner_id");
ALTER TABLE "demo_datasets" ADD CONSTRAINT "demo_datasets_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "demo_batches" (
  "id" UUID NOT NULL PRIMARY KEY,
  "dataset_id" TEXT NOT NULL,
  "version" VARCHAR(60) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "lease_expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "demo_batches_status_check" CHECK ("status" IN ('preparing', 'active', 'removed', 'failed')),
  CONSTRAINT "demo_batches_lease_check" CHECK (("status" = 'preparing') = ("lease_expires_at" IS NOT NULL))
);
CREATE INDEX "demo_batches_dataset_id_status_idx" ON "demo_batches"("dataset_id", "status");
CREATE UNIQUE INDEX "demo_batches_one_live_set" ON "demo_batches"("dataset_id")
  WHERE "status" IN ('preparing', 'active');
ALTER TABLE "demo_batches" ADD CONSTRAINT "demo_batches_dataset_id_fkey"
  FOREIGN KEY ("dataset_id") REFERENCES "demo_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "demo_items" (
  "id" UUID NOT NULL PRIMARY KEY,
  "batch_id" UUID NOT NULL,
  "item_key" VARCHAR(60) NOT NULL,
  "listing_id" UUID,
  "image_id" UUID NOT NULL
);
CREATE UNIQUE INDEX "demo_items_listing_id_key" ON "demo_items"("listing_id");
CREATE UNIQUE INDEX "demo_items_image_id_key" ON "demo_items"("image_id");
CREATE UNIQUE INDEX "demo_items_batch_id_item_key_key" ON "demo_items"("batch_id", "item_key");
ALTER TABLE "demo_items" ADD CONSTRAINT "demo_items_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "demo_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demo_items" ADD CONSTRAINT "demo_items_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "demo_media_objects" (
  "object_key" TEXT NOT NULL PRIMARY KEY,
  "batch_id" UUID NOT NULL
);
CREATE INDEX "demo_media_objects_batch_id_idx" ON "demo_media_objects"("batch_id");
ALTER TABLE "demo_media_objects" ADD CONSTRAINT "demo_media_objects_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "demo_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
