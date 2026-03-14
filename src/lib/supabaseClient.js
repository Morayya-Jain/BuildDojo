/*
Run this SQL in Supabase SQL editor:

-- Table 1: projects
CREATE TABLE projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  description text NOT NULL,
  skill_level text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  completed boolean DEFAULT false
);

-- Table 2: tasks
CREATE TABLE tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  task_index integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  hint text NOT NULL,
  example_output text NOT NULL,
  completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- RLS Policies (run these too):
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own projects"
ON projects FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own tasks"
ON tasks FOR ALL USING (auth.uid() = user_id);
*/

import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
