import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSelect() {
  const { data, error } = await supabase.from('companies').select('*');
  console.log("ESITO SELECT (ANON KEY):", { data, error });
}

testSelect();
