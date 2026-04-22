import { createClient } from '@supabase/supabase-js';

// Usiamo un URL mock durante la build se le variabili mancano, per evitare che createClient vada in crash
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder_service_key';

// Default client (per query lato client o pubbliche)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (Bypassa le Row Level Security policies per poter scrivere dal server backend)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
