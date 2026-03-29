import { supabase } from './server/db.js';

async function run() {
  const { data, error } = await supabase.from('employees').select('id, full_name, contract_type');
  console.log(data);
}
run();
