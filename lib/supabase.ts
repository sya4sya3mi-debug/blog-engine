import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Article = {
  id?: number;
  site: string;
  site_color: string;
  title: string;
  keyword: string;
  generated_at: string;
  scheduled_for: string;
  status: string;
  content: string;
  comment: string;
  created_at?: string;
};
