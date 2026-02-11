-- Example sections: collections of successful messages used as few-shot references
CREATE TABLE IF NOT EXISTS public.example_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_example_sections_owner ON example_sections(owner_id);

-- Enable RLS
ALTER TABLE example_sections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own example_sections" ON example_sections;
CREATE POLICY "Users can view own example_sections" ON example_sections
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own example_sections" ON example_sections;
CREATE POLICY "Users can create own example_sections" ON example_sections
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own example_sections" ON example_sections;
CREATE POLICY "Users can update own example_sections" ON example_sections
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own example_sections" ON example_sections;
CREATE POLICY "Users can delete own example_sections" ON example_sections
  FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role can manage all example_sections" ON example_sections;
CREATE POLICY "Service role can manage all example_sections" ON example_sections
  FOR ALL USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE TRIGGER update_example_sections_updated_at
  BEFORE UPDATE ON example_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- Example messages: individual messages within a section
CREATE TABLE IF NOT EXISTS public.example_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.example_sections(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_example_messages_section ON example_messages(section_id);
CREATE INDEX IF NOT EXISTS idx_example_messages_owner ON example_messages(owner_id);

-- Enable RLS
ALTER TABLE example_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own example_messages" ON example_messages;
CREATE POLICY "Users can view own example_messages" ON example_messages
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create own example_messages" ON example_messages;
CREATE POLICY "Users can create own example_messages" ON example_messages
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own example_messages" ON example_messages;
CREATE POLICY "Users can update own example_messages" ON example_messages
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own example_messages" ON example_messages;
CREATE POLICY "Users can delete own example_messages" ON example_messages
  FOR DELETE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role can manage all example_messages" ON example_messages;
CREATE POLICY "Service role can manage all example_messages" ON example_messages
  FOR ALL USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE TRIGGER update_example_messages_updated_at
  BEFORE UPDATE ON example_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
