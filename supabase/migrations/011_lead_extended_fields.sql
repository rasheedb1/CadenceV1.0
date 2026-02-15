-- =====================================================
-- Extended Lead Fields (Apollo CSV compatibility)
-- =====================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_linkedin_url TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS annual_revenue TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS total_funding TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS latest_funding TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS latest_funding_amount TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS corporate_phone TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS personal_phone TEXT;
