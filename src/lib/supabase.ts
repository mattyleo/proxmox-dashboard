import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Default client (per query lato client o pubbliche)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (Bypassa le Row Level Security policies per poter scrivere dal server backend)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
