-- Block 29: unified operations + finance/provider reconciliation
CREATE TABLE IF NOT EXISTS finance_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  checked_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS finance_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES finance_reconciliation_runs(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  payment_id UUID REFERENCES payments(id),
  item_type VARCHAR(50) NOT NULL,
  expected_paise BIGINT,
  observed_paise BIGINT,
  status VARCHAR(30) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS provider_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  checked_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  mismatch_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS provider_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES provider_reconciliation_runs(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id),
  order_id UUID REFERENCES orders(id),
  provider VARCHAR(50) NOT NULL,
  local_status VARCHAR(30),
  provider_status VARCHAR(50),
  amount_paise BIGINT,
  provider_amount_paise BIGINT,
  status VARCHAR(30) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_recon_items_run_status ON finance_reconciliation_items(run_id,status);
CREATE INDEX IF NOT EXISTS idx_provider_recon_items_run_status ON provider_reconciliation_items(run_id,status);
CREATE INDEX IF NOT EXISTS idx_provider_recon_runs_created ON provider_reconciliation_runs(created_at DESC);
