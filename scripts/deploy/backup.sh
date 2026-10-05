#!/usr/bin/env bash
set -euo pipefail
umask 077
test -n "${DIRECT_URL:-}" || { echo 'DIRECT_URL ausente'; exit 1; }
test -n "${BACKUP_PASSPHRASE:-}" || { echo 'BACKUP_PASSPHRASE ausente'; exit 1; }
test "${#BACKUP_PASSPHRASE}" -ge 32 || { echo 'BACKUP_PASSPHRASE insuficiente'; exit 1; }
test -n "${RESTORE_CONTAINER:-}" || { echo 'PostgreSQL isolado ausente'; exit 1; }
backup_dir="$(mktemp -d)"
trap 'rm -rf "$backup_dir"' EXIT
# O dump nunca vai para stdout, logs ou artifacts em texto claro.
docker run --rm --network host -e DIRECT_URL postgres:17-alpine \
  sh -c 'pg_dump "$DIRECT_URL" --format=custom --no-owner --no-acl' > "$backup_dir/production.dump" 2> "$backup_dir/dump.log" \
  || { echo 'Dump falhou; detalhes de conexão suprimidos'; exit 1; }
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
  --output "$backup_dir/production.dump.gpg" "$backup_dir/production.dump" 3<<< "$BACKUP_PASSPHRASE"
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
  --output "$backup_dir/restored.dump" --decrypt "$backup_dir/production.dump.gpg" 3<<< "$BACKUP_PASSPHRASE"
cmp "$backup_dir/production.dump" "$backup_dir/restored.dump"
docker cp "$backup_dir/restored.dump" "$RESTORE_CONTAINER:/tmp/restore.dump"
docker exec "$RESTORE_CONTAINER" pg_restore --exit-on-error --no-owner --no-acl \
  --username restore_check --dbname restore_check /tmp/restore.dump > "$backup_dir/restore.log" 2>&1 \
  || { echo 'Prova de restauração falhou; detalhes e dados não publicados.'; exit 1; }
history_present="$(docker exec "$RESTORE_CONTAINER" psql --username restore_check --dbname restore_check \
  -At -v ON_ERROR_STOP=1 -c 'SELECT count(*) > 0 FROM _prisma_migrations')"
test "$history_present" = 't' || { echo 'Histórico de migrations não restaurado'; exit 1; }
mkdir -p release-backup
cp "$backup_dir/production.dump.gpg" release-backup/production.dump.gpg
echo 'Backup cifrado e restauração em PostgreSQL isolado aprovados.'
