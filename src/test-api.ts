import { supabase } from './server/db.js';

async function run() {
  const todayStr = new Date().toISOString().split('T')[0];
  let expiredContractsQuery = supabase
    .from('employees')
    .select('id, full_name, contract_end, contract_type')
    .eq('status', 'activo')
    .not('contract_end', 'is', null)
    .lt('contract_end', todayStr)
    .or('contract_type.neq.Indefinido,contract_type.is.null');
    
  const { data, error } = await expiredContractsQuery;
  if (error) console.error(error);
  else console.log(data);
}
run();
