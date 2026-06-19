-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- 1. Table: projects (already exists, but kept for completeness in migrations)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    name TEXT NOT NULL,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT chk_project_status CHECK (status IN ('active', 'paused', 'frozen', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 2. Table: price_catalog (Global / System catalog, no user_id)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.price_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_type TEXT NOT NULL,
    unit TEXT NOT NULL,
    unit_type TEXT NOT NULL CONSTRAINT chk_catalog_unit_type CHECK (unit_type IN ('sq_m', 'lm', 'service')),
    base_price NUMERIC NOT NULL CHECK (base_price >= 0),
    region TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_price_catalog_work_type ON public.price_catalog(work_type);

-- Enable Row Level Security (RLS)
ALTER TABLE public.price_catalog ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. Table: work_logs (already exists, but kept for completeness in migrations)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    work_date DATE NOT NULL,
    voice_transcript TEXT,
    work_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    volumes_confirmed BOOLEAN NOT NULL DEFAULT false,
    is_day_off BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_work_logs_user_id ON public.work_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_project_id ON public.work_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_work_date ON public.work_logs(work_date);

-- Enable Row Level Security (RLS)
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 4. Table: estimate_history (already exists, but kept for completeness in migrations)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.estimate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    last_work_log_id UUID REFERENCES public.work_logs(id) ON DELETE SET NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_estimate_history_user_id ON public.estimate_history(user_id);
CREATE INDEX IF NOT EXISTS idx_estimate_history_project_id ON public.estimate_history(project_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.estimate_history ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- RLS POLICIES
-- =========================================================================

-- Policies for: projects
CREATE POLICY "Users can view their own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for: price_catalog (Global read access, no modifications from clients)
CREATE POLICY "Anyone can view prices" ON public.price_catalog
    FOR SELECT USING (true);

-- Policies for: work_logs
DROP POLICY IF EXISTS "Users can view their own work logs" ON public.work_logs;
DROP POLICY IF EXISTS "Users can insert their own work logs" ON public.work_logs;
DROP POLICY IF EXISTS "Users can update their own work logs" ON public.work_logs;
DROP POLICY IF EXISTS "Users can delete their own work logs" ON public.work_logs;
DROP POLICY IF EXISTS "Users manage own work logs" ON public.work_logs;
DROP POLICY IF EXISTS "Work Logs Row-Level Security" ON public.work_logs;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.work_logs;

CREATE POLICY "work_logs_policy"
ON public.work_logs FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policies for: estimate_history
CREATE POLICY "Users can view their own estimate history" ON public.estimate_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own estimate history" ON public.estimate_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own estimate history" ON public.estimate_history
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own estimate history" ON public.estimate_history
    FOR DELETE USING (auth.uid() = user_id);


-- =========================================================================
-- SEED DATA: Global Price Catalog (Ukrainian)
-- =========================================================================
INSERT INTO public.price_catalog (work_type, unit, unit_type, base_price, region) VALUES
-- Walls & Ceilings (Plastering & Painting)
('Шпаклівка стін стартова', 'м²', 'sq_m', 150.00, 'Україна'),
('Шпаклівка стін фінішна', 'м²', 'sq_m', 180.00, 'Україна'),
('Штукатурка стін гіпсова', 'м²', 'sq_m', 220.00, 'Україна'),
('Штукатурка стін цементна', 'м²', 'sq_m', 250.00, 'Україна'),
('Ґрунтування стін', 'м²', 'sq_m', 40.00, 'Україна'),
('Фарбування стін (2 шари)', 'м²', 'sq_m', 120.00, 'Україна'),
('Поклейка шпалер без підбору', 'м²', 'sq_m', 130.00, 'Україна'),
('Поклейка шпалер з підбором', 'м²', 'sq_m', 160.00, 'Україна'),
('Монтаж гіпсокартону на стіни', 'м²', 'sq_m', 180.00, 'Україна'),
('Монтаж гіпсокартону на стелю', 'м²', 'sq_m', 240.00, 'Україна'),

-- Floor works
('Укладання плитки (стіни/підлога)', 'м²', 'sq_m', 500.00, 'Україна'),
('Укладання ламінату', 'м²', 'sq_m', 150.00, 'Україна'),
('Стяжка підлоги самовирівнювальна', 'м²', 'sq_m', 150.00, 'Україна'),
('Стяжка підлоги цементно-піщана', 'м²', 'sq_m', 200.00, 'Україна'),

-- Linear elements (Meters)
('Монтаж плінтуса пластикового', 'п.м', 'lm', 60.00, 'Україна'),
('Монтаж плінтуса МДФ/дерево', 'п.м', 'lm', 100.00, 'Україна'),
('Поклейка багетів (стельовий плінтус)', 'п.м', 'lm', 80.00, 'Україна'),

-- Services (Fix price or count-based)
('Доставка будівельних матеріалів', 'послуга', 'service', 600.00, 'Україна'),
('Винесення та вивезення сміття', 'послуга', 'service', 800.00, 'Україна'),
('Підйом матеріалів на поверх', 'послуга', 'service', 400.00, 'Україна'),
('Демонтаж старих покриттів', 'послуга', 'service', 500.00, 'Україна'),
('Електромонтаж (точка)', 'послуга', 'service', 250.00, 'Україна'),
('Сантехмонтаж (точка)', 'послуга', 'service', 600.00, 'Україна')
ON CONFLICT DO NOTHING;
