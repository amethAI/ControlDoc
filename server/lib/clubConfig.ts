import { supabase } from '../db.ts';

export interface ClubConfig {
  id: string;
  name: string;
  country: string;
  country_code: string;
  timezone: string;
  locale: string;
  currency: string;
  kronos_prefix: string;
  salary_mensual: number;
  salary_dia: number;
  salary_dom: number;
  css_rate: number;
  default_position: string;
  sheet_name: string;
  sort_order: number;
  programacion_sheet_id: string | null;
  prog_header_row: number;
  prog_name_col: number;
  prog_data_start_row: number;
}

const DEFAULTS: Omit<ClubConfig, 'id' | 'name'> = {
  country:                'Panama',
  country_code:           'PA',
  timezone:               'America/Panama',
  locale:                 'es-PA',
  currency:               'PAB',
  kronos_prefix:          'PA',
  salary_mensual:         657.28,
  salary_dia:             25.28,
  salary_dom:             33.18,
  css_rate:               0.11,
  default_position:       'DEMOSTRADORA',
  sheet_name:             'PRICESMART ',
  sort_order:             99,
  programacion_sheet_id:  null,
  prog_header_row:        4,
  prog_name_col:          2,
  prog_data_start_row:    5,
};

const CONFIG_COLUMNS = [
  'id', 'name', 'country', 'country_code', 'timezone', 'locale',
  'currency', 'kronos_prefix', 'salary_mensual', 'salary_dia',
  'salary_dom', 'css_rate', 'default_position', 'sheet_name', 'sort_order',
  'programacion_sheet_id', 'prog_header_row', 'prog_name_col', 'prog_data_start_row',
].join(', ');

const cache    = new Map<string, ClubConfig>();
const cacheAt  = new Map<string, number>();
const TTL_MS   = 5 * 60 * 1000; // 5 minutes

export async function getClubConfig(clubId: string): Promise<ClubConfig> {
  const now = Date.now();
  const hit = cache.get(clubId);
  if (hit && now - (cacheAt.get(clubId) ?? 0) < TTL_MS) return hit;

  const { data: rawData } = await supabase
    .from('clubs')
    .select(CONFIG_COLUMNS)
    .eq('id', clubId)
    .maybeSingle();

  const data = rawData as any;
  const cfg: ClubConfig = {
    id:               data?.id               ?? clubId,
    name:             data?.name             ?? clubId,
    country:          data?.country          ?? DEFAULTS.country,
    country_code:     data?.country_code     ?? DEFAULTS.country_code,
    timezone:         data?.timezone         ?? DEFAULTS.timezone,
    locale:           data?.locale           ?? DEFAULTS.locale,
    currency:         data?.currency         ?? DEFAULTS.currency,
    kronos_prefix:    data?.kronos_prefix    ?? DEFAULTS.kronos_prefix,
    salary_mensual:   Number(data?.salary_mensual   ?? DEFAULTS.salary_mensual),
    salary_dia:       Number(data?.salary_dia       ?? DEFAULTS.salary_dia),
    salary_dom:       Number(data?.salary_dom       ?? DEFAULTS.salary_dom),
    css_rate:         Number(data?.css_rate         ?? DEFAULTS.css_rate),
    default_position:       data?.default_position       ?? DEFAULTS.default_position,
    sheet_name:             data?.sheet_name             ?? DEFAULTS.sheet_name,
    sort_order:             Number(data?.sort_order      ?? DEFAULTS.sort_order),
    programacion_sheet_id:  data?.programacion_sheet_id  ?? null,
    prog_header_row:        Number(data?.prog_header_row ?? DEFAULTS.prog_header_row),
    prog_name_col:          Number(data?.prog_name_col   ?? DEFAULTS.prog_name_col),
    prog_data_start_row:    Number(data?.prog_data_start_row ?? DEFAULTS.prog_data_start_row),
  };

  cache.set(clubId, cfg);
  cacheAt.set(clubId, now);
  return cfg;
}

export function invalidateClubConfig(clubId: string): void {
  cache.delete(clubId);
  cacheAt.delete(clubId);
}
