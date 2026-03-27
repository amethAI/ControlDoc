import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

const createMockClient = (): SupabaseClient => {
  console.warn('⚠️ Supabase URL or Key is missing. Using mock client. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  
  const mockQuery: any = {
    select: () => mockQuery,
    insert: () => mockQuery,
    update: () => mockQuery,
    delete: () => mockQuery,
    eq: () => mockQuery,
    neq: () => mockQuery,
    gt: () => mockQuery,
    gte: () => mockQuery,
    lt: () => mockQuery,
    lte: () => mockQuery,
    like: () => mockQuery,
    ilike: () => mockQuery,
    is: () => mockQuery,
    in: () => mockQuery,
    contains: () => mockQuery,
    containedBy: () => mockQuery,
    rangeGt: () => mockQuery,
    rangeGte: () => mockQuery,
    rangeLt: () => mockQuery,
    rangeLte: () => mockQuery,
    rangeAdjacent: () => mockQuery,
    overlaps: () => mockQuery,
    textSearch: () => mockQuery,
    match: () => mockQuery,
    not: () => mockQuery,
    or: () => mockQuery,
    filter: () => mockQuery,
    order: () => mockQuery,
    limit: () => mockQuery,
    range: () => mockQuery,
    abortSignal: () => mockQuery,
    single: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    maybeSingle: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    csv: () => Promise.resolve({ data: '', error: null }),
    upsert: () => mockQuery,
    then: (resolve: any) => resolve({ data: [], error: null, count: 0 }),
  };

  return {
    from: () => mockQuery,
    auth: {
      admin: {},
      signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
      listBuckets: () => Promise.resolve({ data: [], error: null }),
      createBucket: () => Promise.resolve({ data: null, error: null }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as SupabaseClient;
};

export const getSupabase = (): SupabaseClient => {
  if (!supabaseInstance) {
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
    // Prioritize service_role key to bypass RLS, fallback to anon_key
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

    console.log('--- Supabase Config Check ---');
    console.log('URL present:', !!supabaseUrl);
    console.log('Key present:', !!supabaseKey);
    if (supabaseUrl) console.log('URL starts with:', supabaseUrl.substring(0, 15));
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase URL or Key is missing. Using mock client.');
      supabaseInstance = createMockClient();
    } else {
      console.log('✅ Initializing real Supabase client');
      supabaseInstance = createClient(supabaseUrl, supabaseKey);
    }
  }
  return supabaseInstance;
};

// For backward compatibility, but it might still throw if accessed immediately
export const supabase = {
  from: (table: string) => getSupabase().from(table),
  auth: {
    get admin() { return getSupabase().auth.admin; },
    get signInWithPassword() { return getSupabase().auth.signInWithPassword; },
    // Add other auth methods if needed
  },
  get storage() { return getSupabase().storage; },
  rpc: (fn: string, args?: any) => getSupabase().rpc(fn, args),
} as unknown as SupabaseClient;

export function closeDatabase() {
  // Supabase connection is managed automatically
}

export function reopenDatabase() {
  // Supabase connection is managed automatically
}

