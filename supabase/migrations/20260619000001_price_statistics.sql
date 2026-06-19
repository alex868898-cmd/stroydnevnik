CREATE TABLE IF NOT EXISTS price_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type TEXT NOT NULL,
  price NUMERIC NOT NULL,
  region TEXT DEFAULT 'ukraine',
  city TEXT,
  recorded_at DATE NOT NULL DEFAULT now()
);

-- Индекс для быстрых запросов
CREATE INDEX IF NOT EXISTS idx_price_stats_work_type 
ON price_statistics(work_type, recorded_at DESC);

-- RLS: читать могут все авторизованные, писать — тоже
ALTER TABLE price_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read price stats"
ON price_statistics FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Anyone can insert price stats"
ON price_statistics FOR INSERT
TO authenticated WITH CHECK (true);
