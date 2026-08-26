import { createClient } from '@supabase/supabase-js';

// Sanitize string to ensure only valid printable ASCII / ISO-8859-1 characters (removes zero-width characters, smart quotes, etc.)
function sanitize(val, fallback = '') {
  if (!val || typeof val !== 'string') return fallback;
  const cleaned = val.replace(/[^\x20-\x7E]/g, '').trim().replace(/^["']|["']$/g, '');
  return cleaned || fallback;
}

const DEFAULT_URL = 'https://fubrqdxhmhfntqgwdbae.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1YnJxZHhobWhmbnRxZ3dkYmFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMTk1MzgsImV4cCI6MjEwMDg5NTUzOH0.pGj5Xx9o-qvqzUkG1Dp_BOz0SDmsC1AiEpd5Br1cmPE';

const rawUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : '';
const rawKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : '';

const SUPABASE_URL = sanitize(rawUrl, DEFAULT_URL);
const SUPABASE_ANON_KEY = sanitize(rawKey, DEFAULT_ANON_KEY);

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
