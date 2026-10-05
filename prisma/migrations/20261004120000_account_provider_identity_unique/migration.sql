-- #81 — entrada com Conta Google (identity-contract.md, IC-15.4).
-- Uma identidade de provedor (`provider_id` + `account_id`, que para o Google
-- e o `sub`) pertence a no maximo uma conta TROQ. Sem o indice, dois callbacks
-- ou duas conclusoes de cadastro concorrentes poderiam gravar a mesma
-- identidade duas vezes, e a busca do provedor por `(provider_id, account_id)`
-- ficaria ambigua.
--
-- Aditiva: as linhas existentes sao so credenciais (`provider_id = 'credential'`,
-- `account_id = user_id`), uma por usuario, e nao conflitam.

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");
