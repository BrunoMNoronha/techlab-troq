-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'blocked_age', 'blocked_admin', 'deletion_requested');

-- CreateEnum
CREATE TYPE "terms_acceptance_type" AS ENUM ('age_eligibility', 'listing_compliance');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('draft', 'published', 'paused', 'closed', 'removed');

-- CreateEnum
CREATE TYPE "listing_image_status" AS ENUM ('uploaded', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "image_derivative_kind" AS ENUM ('thumb', 'medium', 'large');

-- CreateEnum
CREATE TYPE "contact_request_status" AS ENUM ('reserved', 'paid', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "payment_attempt_status" AS ENUM ('tentativa_criada', 'aguardando_pagamento', 'em_confirmacao', 'pagamento_confirmado', 'expirada', 'falha', 'reembolso_pendente', 'reembolsada_ou_revertida', 'inconsistente');

-- CreateEnum
CREATE TYPE "recognition_source" AS ENUM ('notificacao', 'reconciliacao');

-- CreateEnum
CREATE TYPE "technical_refund_hypothesis" AS ENUM ('rt_1', 'rt_2', 'rt_3', 'rt_4');

-- CreateEnum
CREATE TYPE "technical_refund_status" AS ENUM ('pendente', 'concluido', 'falhou_retentando', 'pendente_operacional');

-- CreateEnum
CREATE TYPE "reconciliation_case_kind" AS ENUM ('pendente', 'divergencia', 'reembolso_pendente', 'inconsistente');

-- CreateEnum
CREATE TYPE "negotiation_status" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "rating_validity" AS ENUM ('valid', 'invalidated');

-- CreateEnum
CREATE TYPE "report_category" AS ENUM ('pi_01', 'pi_02', 'pi_03', 'pi_04', 'pi_05', 'pi_06', 'pi_07', 'pi_08', 'pi_09', 'pi_10', 'pi_11', 'pi_12', 'outro');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('recebida', 'procedente', 'improcedente', 'sem_acao');

-- CreateEnum
CREATE TYPE "moderation_outcome" AS ENUM ('procedente', 'improcedente', 'sem_acao');

-- CreateEnum
CREATE TYPE "sanction_kind" AS ENUM ('advertencia', 'restricao_temporaria', 'bloqueio_administrativo');

-- CreateEnum
CREATE TYPE "appeal_outcome" AS ENUM ('mantida', 'revista');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_contacts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "terms_acceptance_type" NOT NULL,
    "terms_version" TEXT NOT NULL,
    "listing_id" UUID,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "immediate_effect_at" TIMESTAMPTZ(6) NOT NULL,
    "purge_completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "status" "listing_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "paused_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_transitions" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "from_status" "listing_status" NOT NULL,
    "to_status" "listing_status" NOT NULL,
    "reason" TEXT,
    "category" "report_category",
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_images" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "listing_image_status" NOT NULL DEFAULT 'uploaded',
    "object_key" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_derivatives" (
    "id" UUID NOT NULL,
    "image_id" UUID NOT NULL,
    "kind" "image_derivative_kind" NOT NULL,
    "object_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_derivatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_requests" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "slot_index" INTEGER NOT NULL,
    "status" "contact_request_status" NOT NULL DEFAULT 'reserved',
    "reserved_from" TIMESTAMPTZ(6) NOT NULL,
    "reserved_until" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "contact_request_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "external_reference" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "status" "payment_attempt_status" NOT NULL DEFAULT 'tentativa_criada',
    "accredited_at" TIMESTAMPTZ(6),
    "recognized_at" TIMESTAMPTZ(6),
    "recognition_source" "recognition_source",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "payment_attempt_id" UUID NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "provider_status" TEXT NOT NULL,
    "provider_status_detail" TEXT,
    "accredited_at" TIMESTAMPTZ(6),
    "is_canonical" BOOLEAN NOT NULL DEFAULT false,
    "first_observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "hypothesis" "technical_refund_hypothesis" NOT NULL,
    "status" "technical_refund_status" NOT NULL DEFAULT 'pendente',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),
    "last_attempt_result" TEXT,
    "provider_refund_id" TEXT,
    "concluded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "technical_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_notifications" (
    "id" UUID NOT NULL,
    "payment_attempt_id" UUID,
    "provider_request_id" TEXT NOT NULL,
    "provider_data_id" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "processing_result" TEXT,

    CONSTRAINT "payment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_cases" (
    "id" UUID NOT NULL,
    "payment_attempt_id" UUID NOT NULL,
    "kind" "reconciliation_case_kind" NOT NULL,
    "reason" TEXT NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "outcome" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reconciliation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selections" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "contact_request_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "selected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiations" (
    "id" UUID NOT NULL,
    "selection_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "chosen_id" UUID NOT NULL,
    "status" "negotiation_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_releases" (
    "id" UUID NOT NULL,
    "negotiation_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "contact_request_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "authorized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_access_events" (
    "id" UUID NOT NULL,
    "contact_release_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "negotiation_id" UUID NOT NULL,
    "evaluator_id" UUID NOT NULL,
    "evaluated_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "validity" "rating_validity" NOT NULL DEFAULT 'valid',
    "invalidated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "category" "report_category" NOT NULL,
    "details" VARCHAR(500),
    "status" "report_status" NOT NULL DEFAULT 'recebida',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_decisions" (
    "id" UUID NOT NULL,
    "report_id" UUID,
    "listing_id" UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "outcome" "moderation_outcome" NOT NULL,
    "category" "report_category",
    "reason" TEXT NOT NULL,
    "knowledge_source" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctions" (
    "id" UUID NOT NULL,
    "moderation_decision_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "sanction_kind" NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL,
    "moderation_decision_id" UUID NOT NULL,
    "appellant_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "appeal_outcome",
    "decided_at" TIMESTAMPTZ(6),
    "decided_by_id" UUID,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" UUID,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "result" TEXT NOT NULL,
    "details" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_contacts_user_id_key" ON "user_contacts"("user_id");

-- CreateIndex
CREATE INDEX "terms_acceptances_user_id_idx" ON "terms_acceptances"("user_id");

-- CreateIndex
CREATE INDEX "terms_acceptances_listing_id_idx" ON "terms_acceptances"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_deletion_requests_user_id_key" ON "account_deletion_requests"("user_id");

-- CreateIndex
CREATE INDEX "listings_owner_id_idx" ON "listings"("owner_id");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listing_transitions_listing_id_idx" ON "listing_transitions"("listing_id");

-- CreateIndex
CREATE INDEX "listing_transitions_actor_id_idx" ON "listing_transitions"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_images_listing_id_position_key" ON "listing_images"("listing_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "image_derivatives_image_id_kind_key" ON "image_derivatives"("image_id", "kind");

-- CreateIndex
CREATE INDEX "contact_requests_listing_id_idx" ON "contact_requests"("listing_id");

-- CreateIndex
CREATE INDEX "contact_requests_requester_id_idx" ON "contact_requests"("requester_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_contact_request_id_key" ON "payment_attempts"("contact_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_idempotency_key_key" ON "payment_attempts"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_external_reference_key" ON "payment_attempts"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_order_id_key" ON "payment_attempts"("provider_order_id");

-- CreateIndex
CREATE INDEX "payment_attempts_status_idx" ON "payment_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_payment_attempt_id_idx" ON "payments"("payment_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "technical_refunds_payment_id_key" ON "technical_refunds"("payment_id");

-- CreateIndex
CREATE INDEX "technical_refunds_status_idx" ON "technical_refunds"("status");

-- CreateIndex
CREATE INDEX "payment_notifications_payment_attempt_id_idx" ON "payment_notifications"("payment_attempt_id");

-- CreateIndex
CREATE INDEX "payment_notifications_provider_data_id_idx" ON "payment_notifications"("provider_data_id");

-- CreateIndex
CREATE INDEX "reconciliation_cases_payment_attempt_id_idx" ON "reconciliation_cases"("payment_attempt_id");

-- CreateIndex
CREATE INDEX "reconciliation_cases_kind_closed_at_idx" ON "reconciliation_cases"("kind", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "selections_contact_request_id_key" ON "selections"("contact_request_id");

-- CreateIndex
CREATE INDEX "selections_listing_id_idx" ON "selections"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "negotiations_selection_id_key" ON "negotiations"("selection_id");

-- CreateIndex
CREATE INDEX "negotiations_listing_id_idx" ON "negotiations"("listing_id");

-- CreateIndex
CREATE INDEX "negotiations_owner_id_idx" ON "negotiations"("owner_id");

-- CreateIndex
CREATE INDEX "negotiations_chosen_id_idx" ON "negotiations"("chosen_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_releases_negotiation_id_key" ON "contact_releases"("negotiation_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_releases_contact_request_id_key" ON "contact_releases"("contact_request_id");

-- CreateIndex
CREATE INDEX "contact_releases_recipient_id_idx" ON "contact_releases"("recipient_id");

-- CreateIndex
CREATE INDEX "contact_releases_payment_id_idx" ON "contact_releases"("payment_id");

-- CreateIndex
CREATE INDEX "contact_access_events_contact_release_id_idx" ON "contact_access_events"("contact_release_id");

-- CreateIndex
CREATE INDEX "ratings_evaluated_id_idx" ON "ratings"("evaluated_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_negotiation_id_evaluator_id_key" ON "ratings"("negotiation_id", "evaluator_id");

-- CreateIndex
CREATE INDEX "reports_listing_id_idx" ON "reports"("listing_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_listing_id_key" ON "reports"("reporter_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_decisions_report_id_key" ON "moderation_decisions"("report_id");

-- CreateIndex
CREATE INDEX "moderation_decisions_listing_id_idx" ON "moderation_decisions"("listing_id");

-- CreateIndex
CREATE INDEX "moderation_decisions_moderator_id_idx" ON "moderation_decisions"("moderator_id");

-- CreateIndex
CREATE INDEX "sanctions_user_id_idx" ON "sanctions"("user_id");

-- CreateIndex
CREATE INDEX "sanctions_moderation_decision_id_idx" ON "sanctions"("moderation_decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "appeals_moderation_decision_id_key" ON "appeals"("moderation_decision_id");

-- CreateIndex
CREATE INDEX "appeals_appellant_id_idx" ON "appeals"("appellant_id");

-- CreateIndex
CREATE INDEX "audit_events_target_type_target_id_idx" ON "audit_events"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events"("actor_id");

-- CreateIndex
CREATE INDEX "audit_events_event_type_occurred_at_idx" ON "audit_events"("event_type", "occurred_at");

-- AddForeignKey
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_transitions" ADD CONSTRAINT "listing_transitions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_transitions" ADD CONSTRAINT "listing_transitions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_derivatives" ADD CONSTRAINT "image_derivatives_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "listing_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_contact_request_id_fkey" FOREIGN KEY ("contact_request_id") REFERENCES "contact_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_refunds" ADD CONSTRAINT "technical_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_notifications" ADD CONSTRAINT "payment_notifications_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_cases" ADD CONSTRAINT "reconciliation_cases_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_contact_request_id_fkey" FOREIGN KEY ("contact_request_id") REFERENCES "contact_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_selection_id_fkey" FOREIGN KEY ("selection_id") REFERENCES "selections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_chosen_id_fkey" FOREIGN KEY ("chosen_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_releases" ADD CONSTRAINT "contact_releases_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "negotiations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_releases" ADD CONSTRAINT "contact_releases_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_releases" ADD CONSTRAINT "contact_releases_contact_request_id_fkey" FOREIGN KEY ("contact_request_id") REFERENCES "contact_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_releases" ADD CONSTRAINT "contact_releases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_releases" ADD CONSTRAINT "contact_releases_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_releases" ADD CONSTRAINT "contact_releases_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_access_events" ADD CONSTRAINT "contact_access_events_contact_release_id_fkey" FOREIGN KEY ("contact_release_id") REFERENCES "contact_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_access_events" ADD CONSTRAINT "contact_access_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_negotiation_id_fkey" FOREIGN KEY ("negotiation_id") REFERENCES "negotiations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_evaluated_id_fkey" FOREIGN KEY ("evaluated_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_moderation_decision_id_fkey" FOREIGN KEY ("moderation_decision_id") REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_moderation_decision_id_fkey" FOREIGN KEY ("moderation_decision_id") REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_appellant_id_fkey" FOREIGN KEY ("appellant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- SQL customizado (ADR-0005, decisao 5). Garantias que o Prisma Schema nao
-- expressa de forma estavel: indices unicos parciais, CHECKs e triggers.
-- Cada bloco cita a invariante de docs/architecture/data-model.md que
-- materializa. Explicacao consolidada em docs/engineering/database.md.
-- A feature Preview `partialIndexes` NAO e usada.
-- ===========================================================================

-- DM-3.1 — email unico entre contas nao excluidas. Conta em
-- `deletion_requested` ja nao e conta ativa (DM-3.4) e sai da unicidade.
CREATE UNIQUE INDEX "users_email_active_key" ON "users"("email")
  WHERE "status" <> 'deletion_requested';

-- DM-5.1 — matriz de transicoes do anuncio, exatamente T1..T9 (DEC-027 secao 4).
-- Funcao IMMUTABLE reutilizada pelo CHECK do historico e pelo trigger da tabela.
CREATE FUNCTION "troq_listing_transition_allowed"(p_from "listing_status", p_to "listing_status")
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_from, p_to) IN (
    ('draft'::"listing_status",     'published'::"listing_status"), -- T1
    ('draft'::"listing_status",     'closed'::"listing_status"),    -- T2
    ('published'::"listing_status", 'paused'::"listing_status"),    -- T3
    ('paused'::"listing_status",    'published'::"listing_status"), -- T4
    ('published'::"listing_status", 'closed'::"listing_status"),    -- T5
    ('paused'::"listing_status",    'closed'::"listing_status"),    -- T6
    ('draft'::"listing_status",     'removed'::"listing_status"),   -- T7
    ('published'::"listing_status", 'removed'::"listing_status"),   -- T8
    ('paused'::"listing_status",    'removed'::"listing_status")    -- T9
  );
$$;

ALTER TABLE "listing_transitions"
  ADD CONSTRAINT "listing_transitions_allowed_pair_check"
  CHECK ("troq_listing_transition_allowed"("from_status", "to_status"));

CREATE FUNCTION "troq_listings_guard_status"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
     AND NOT "troq_listing_transition_allowed"(OLD."status", NEW."status") THEN
    RAISE EXCEPTION 'listing %: transicao % -> % nao permitida (DEC-027, T1..T9)',
      OLD."id", OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "listings_guard_status"
  BEFORE UPDATE OF "status" ON "listings"
  FOR EACH ROW
  EXECUTE FUNCTION "troq_listings_guard_status"();

-- DM-5.7 — posicao da imagem na faixa 1..6; com o indice unico
-- (listing_id, position) isso limita a 6 imagens por anuncio.
ALTER TABLE "listing_images"
  ADD CONSTRAINT "listing_images_position_range_check"
  CHECK ("position" BETWEEN 1 AND 6);

-- I-1 / DM-6.2 — no maximo 3 vagas ocupadas por anuncio (RB-003).
-- slot_index em {1,2,3} + indice unico PARCIAL sobre as linhas que ocupam vaga.
-- Linhas em `expired`/`failed` saem do indice e liberam o valor sem apagar
-- o historico. A quarta solicitacao concorrente nao tem valor disponivel.
ALTER TABLE "contact_requests"
  ADD CONSTRAINT "contact_requests_slot_index_range_check"
  CHECK ("slot_index" BETWEEN 1 AND 3);

ALTER TABLE "contact_requests"
  ADD CONSTRAINT "contact_requests_reservation_window_check"
  CHECK ("reserved_until" > "reserved_from");

ALTER TABLE "contact_requests"
  ADD CONSTRAINT "contact_requests_paid_at_consistency_check"
  CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL));

CREATE UNIQUE INDEX "contact_requests_listing_slot_occupied_key"
  ON "contact_requests"("listing_id", "slot_index")
  WHERE "status" IN ('reserved', 'paid');

-- I-8 / DM-6.7 — consumo de vaga e fato historico: `paid` nao tem transicao
-- de saida, e a vaga (listing_id, slot_index) de uma linha `paid` nao muda.
-- Garantia de banco que depende do valor anterior da linha: trigger.
CREATE FUNCTION "troq_contact_requests_guard_paid"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'paid' AND (
       NEW."status" IS DISTINCT FROM 'paid'
    OR NEW."slot_index" IS DISTINCT FROM OLD."slot_index"
    OR NEW."listing_id" IS DISTINCT FROM OLD."listing_id"
  ) THEN
    RAISE EXCEPTION 'contact_request %: linha paid e imutavel quanto a status e vaga (DM-6.7, I-8)',
      OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "contact_requests_guard_paid"
  BEFORE UPDATE ON "contact_requests"
  FOR EACH ROW
  EXECUTE FUNCTION "troq_contact_requests_guard_paid"();

-- I-2 — tentativa unica por solicitacao ja vem de `payment_attempts_contact_request_id_key`
-- (gerado pelo Prisma a partir de @unique). Nada a acrescentar aqui.

-- DM-7.4 — no maximo um pagamento canonico por tentativa.
CREATE UNIQUE INDEX "payments_canonical_per_attempt_key"
  ON "payments"("payment_attempt_id")
  WHERE "is_canonical";

-- I-5 / DM-8.5 — no maximo uma negociacao `active` por anuncio (DEC-032 secao 4.1).
CREATE UNIQUE INDEX "negotiations_active_per_listing_key"
  ON "negotiations"("listing_id")
  WHERE "status" = 'active';

-- DM-8.6 / DM-8.7 — `closed` e terminal e carrega o instante do encerramento;
-- as duas partes sao pessoas distintas.
ALTER TABLE "negotiations"
  ADD CONSTRAINT "negotiations_closed_at_consistency_check"
  CHECK (("status" = 'closed') = ("closed_at" IS NOT NULL));

ALTER TABLE "negotiations"
  ADD CONSTRAINT "negotiations_distinct_parties_check"
  CHECK ("owner_id" <> "chosen_id");

CREATE FUNCTION "troq_negotiations_guard_closed"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'closed' AND NEW."status" IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'negotiation %: closed e terminal (DEC-029 secao 5)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "negotiations_guard_closed"
  BEFORE UPDATE OF "status" ON "negotiations"
  FOR EACH ROW
  EXECUTE FUNCTION "troq_negotiations_guard_closed"();

-- I-6 — escolha unica por solicitacao ja vem de `selections_contact_request_id_key`
-- (gerado pelo Prisma a partir de @unique). Nada a acrescentar aqui.

-- DM-9.2 — nota inteira em {1..5}; autoavaliacao impossivel.
ALTER TABLE "ratings"
  ADD CONSTRAINT "ratings_score_range_check"
  CHECK ("score" BETWEEN 1 AND 5);

ALTER TABLE "ratings"
  ADD CONSTRAINT "ratings_distinct_parties_check"
  CHECK ("evaluator_id" <> "evaluated_id");

-- DEC-031 secao 7.3 — decisao de oficio (sem denuncia) registra a origem do
-- conhecimento.
ALTER TABLE "moderation_decisions"
  ADD CONSTRAINT "moderation_decisions_origin_check"
  CHECK ("report_id" IS NOT NULL OR "knowledge_source" IS NOT NULL);
