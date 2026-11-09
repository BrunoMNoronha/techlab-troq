-- pg_restore carrega os dados com search_path vazio. Os corpos destas funcoes
-- usam nomes sem schema ("listing_status", tabelas de guarda), e a CHECK de
-- listing_transitions chama troq_listing_transition_allowed durante a carga:
-- sem search_path fixo, a prova de restauracao do backup falha.
-- ALTER FUNCTION ... SET e idempotente.
ALTER FUNCTION public.troq_listing_transition_allowed(public.listing_status, public.listing_status)
  SET search_path = public;
ALTER FUNCTION public.troq_listings_guard_status() SET search_path = public;
ALTER FUNCTION public.troq_contact_requests_guard_paid() SET search_path = public;
ALTER FUNCTION public.troq_contact_requests_guard_paid_requester() SET search_path = public;
ALTER FUNCTION public.troq_negotiations_guard_closed() SET search_path = public;
