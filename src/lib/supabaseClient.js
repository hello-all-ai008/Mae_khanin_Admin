import { createClient } from '@supabase/supabase-js';

// Sanitize string to ensure only valid printable ASCII / ISO-8859-1 characters (removes zero-width characters, smart quotes, etc.)
function sanitize(val, fallback = '') {
  if (!val || typeof val !== 'string') return fallback;
  const cleaned = val.replace(/[^\x20-\x7E]/g, '').trim().replace(/^["']|["']$/g, '');
  return cleaned || fallback;
}

// Credentials come from the environment only — never hardcode them here.
// Copy .env.example to .env.local and fill it in before running dev or build.
function requireEnv(name) {
  const raw = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env[name] : '';
  const value = sanitize(raw);
  if (!value) {
    throw new Error(`${name} is not configured. Copy .env.example to .env.local and set it.`);
  }
  return value;
}

const SUPABASE_URL = requireEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('VITE_SUPABASE_ANON_KEY');

// Custom safe fetch wrapper to guarantee no invalid non-ISO-8859-1 headers ever reach browser fetch
const safeFetch = (input, init = {}) => {
  if (init && init.headers) {
    const cleanHeaders = {};
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        cleanHeaders[key] = sanitize(value);
      });
    } else if (typeof init.headers === 'object') {
      for (const [k, v] of Object.entries(init.headers)) {
        if (typeof v === 'string') {
          cleanHeaders[k] = sanitize(v);
        } else {
          cleanHeaders[k] = v;
        }
      }
    }
    init.headers = cleanHeaders;
  }
  return fetch(input, init);
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  global: {
    fetch: safeFetch
  }
});
