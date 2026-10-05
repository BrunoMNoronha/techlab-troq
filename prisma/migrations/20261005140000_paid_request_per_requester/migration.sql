-- DEC-051 (#148). Registro auxiliar: a unicidade e o UPSERT serializam
-- admissao/confirmacao inclusive quando duas conexoes usam snapshots diferentes.
-- Nao impor unicidade a contact_requests: duplicidades historicas sao preservadas.
BEGIN;

-- Bloqueia escritas durante backfill/instalacao; nenhuma janela sem protecao.
LOCK TABLE "contact_requests" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "contact_request_paid_guards" (
  "listing_id" UUID NOT NULL,
  "requester_id" UUID NOT NULL,
  "has_paid" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "contact_request_paid_guards_pkey" PRIMARY KEY ("listing_id", "requester_id"),
  CONSTRAINT "contact_request_paid_guards_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_request_paid_guards_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "contact_request_paid_guards_requester_id_idx"
  ON "contact_request_paid_guards"("requester_id");

INSERT INTO "contact_request_paid_guards" ("listing_id", "requester_id", "has_paid")
SELECT DISTINCT "listing_id", "requester_id", true
FROM "contact_requests" WHERE "status" = 'paid';

CREATE FUNCTION "troq_contact_requests_guard_paid_requester"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  admission boolean;
  new_request boolean := TG_OP = 'INSERT';
BEGIN
  IF NEW."status" NOT IN ('reserved', 'paid') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    new_request := NEW."listing_id" IS DISTINCT FROM OLD."listing_id"
      OR NEW."requester_id" IS DISTINCT FROM OLD."requester_id"
      OR (NEW."status" = 'reserved' AND OLD."status" <> 'reserved');
  END IF;

  IF new_request THEN
    -- O conflito espera a outra transacao e reavalia o marcador. Reservas
    -- expiradas/falhas deixam false; paid nunca volta a false (DM-6.7).
    INSERT INTO "contact_request_paid_guards" AS guard
      ("listing_id", "requester_id", "has_paid")
    VALUES (NEW."listing_id", NEW."requester_id", NEW."status" = 'paid')
    ON CONFLICT ("listing_id", "requester_id") DO UPDATE
      SET "has_paid" = EXCLUDED."has_paid"
      WHERE NOT guard."has_paid"
    RETURNING true INTO admission;
    IF admission IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Nova solicitacao recusada: a conta ja pagou neste anuncio (DEC-051)'
        USING ERRCODE = 'unique_violation',
              CONSTRAINT = 'contact_requests_paid_per_requester_guard';
    END IF;
  ELSIF NEW."status" = 'paid' THEN
    -- Confirmar reserva ja admitida preserva pagamentos em andamento e
    -- duplicidades anteriores. Nenhuma transicao financeira e cancelada aqui.
    INSERT INTO "contact_request_paid_guards" ("listing_id", "requester_id", "has_paid")
    VALUES (NEW."listing_id", NEW."requester_id", true)
    ON CONFLICT ("listing_id", "requester_id") DO UPDATE SET "has_paid" = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "contact_requests_guard_paid_requester"
BEFORE INSERT OR UPDATE OF "status", "listing_id", "requester_id" ON "contact_requests"
FOR EACH ROW EXECUTE FUNCTION "troq_contact_requests_guard_paid_requester"();

COMMIT;
