import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // Ayuda rápida si olvidamos variables
  // eslint-disable-next-line no-console
  console.warn('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env');
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: false }, // NO usamos auth de Supabase en este login
});
