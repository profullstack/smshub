-- One CoinPay identity may connect to multiple smshub accounts. Each local
-- user remains limited to one connection by coinpay_connections.user_id UNIQUE.
drop index if exists public.coinpay_connections_coinpay_user_id_key;
create index if not exists coinpay_connections_coinpay_user_id_idx
  on public.coinpay_connections (coinpay_user_id);
