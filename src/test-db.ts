import { supabase } from './server/db.js';

async function run() {
  const { data, error } = await supabase.from('document_types').select('id, name, has_expiry');
  console.log(data);
}
run();
