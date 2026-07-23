import { supabase } from '../db.ts';

const cache = new Map<string, { value: any; at: number }>();
const TTL = 5 * 60 * 1000;

function fresh(key: string): any {
  const e = cache.get(key);
  return e && Date.now() - e.at < TTL ? e.value : undefined;
}

function put(key: string, value: any) {
  cache.set(key, { value, at: Date.now() });
}

export async function getPersonalCombinedIds(): Promise<string[]> {
  const hit = fresh('personal_combined');
  if (hit !== undefined) return hit;
  const { data } = await supabase
    .from('document_types')
    .select('id')
    .eq('is_combined_personal', 1)
    .eq('is_active', 1);
  const ids = ((data as any[]) || []).map((r) => r.id as string);
  put('personal_combined', ids);
  return ids;
}

export async function getDocTypeIdBySlug(slug: string): Promise<string | null> {
  const hit = fresh(`slug:${slug}`);
  if (hit !== undefined) return hit;
  const { data } = await (supabase as any)
    .from('document_types')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  const id: string | null = data?.id ?? null;
  put(`slug:${slug}`, id);
  return id;
}

export function invalidateDocTypeCache() {
  cache.clear();
}
