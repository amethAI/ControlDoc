import { getSupabase } from './server/db.js';

async function run() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('document_types').select('id, name');
  if (error) {
    console.error(error);
    return;
  }
  console.log(data);
}
run();
