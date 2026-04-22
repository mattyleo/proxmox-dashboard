import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function testInsert() {
  console.log("Tentativo di connessione a Supabase...");
  console.log("URL:", supabaseUrl);
  
  const { data, error } = await supabaseAdmin
    .from('companies')
    .insert([{ name: 'Test Script', contact_email: 'test@test.com' }])
    .select();
    
  if (error) {
    console.error("ERRORE DURANTE L'INSERIMENTO:", error);
  } else {
    console.log("INSERIMENTO RIUSCITO:", data);
  }
}

testInsert();
