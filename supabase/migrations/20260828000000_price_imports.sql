ALTER TABLE public.price_statistics ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.price_statistics ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'estimate';
ALTER TABLE public.price_statistics ADD COLUMN IF NOT EXISTS source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Anyone can insert price stats" ON public.price_statistics;
CREATE POLICY "Authenticated users add price stats" ON public.price_statistics
FOR INSERT TO authenticated WITH CHECK (source_user_id IS NULL OR source_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_price_stats_normalized_work_type
ON public.price_statistics (lower(trim(work_type)));
