import { createClient } from '@supabase/supabase-js';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Usiamo un URL mock durante la build se le variabili mancano o sono vuote
const supabaseUrl = envUrl && envUrl.trim() !== '' ? envUrl.trim() : 'https://placeholder.supabase.co';
const supabaseAnonKey = envAnonKey && envAnonKey.trim() !== '' ? envAnonKey.trim() : 'placeholder_anon_key';
const supabaseServiceKey = envServiceKey && envServiceKey.trim() !== '' ? envServiceKey.trim() : 'placeholder_service_key';

// Default client (per query lato client o pubbliche)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (Bypassa le Row Level Security policies per poter scrivere dal server backend)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
