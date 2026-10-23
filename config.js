/* MASAR setup: fill in your Supabase project URL and publishable/anon key. Never put a service_role key here. */
window.MASAR_CONFIG = {
  SUPABASE_URL: 'https://lmcitdqbqktqxwxahrvo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_4y4A6dWyXtL_w5piOBJJyw_FPpyQfRh',
  BUSINESS_WHATSAPP: '201222214520'
};
window.MASAR_SUPABASE = null;
if (window.supabase && window.MASAR_CONFIG.SUPABASE_URL.startsWith('https://') && !window.MASAR_CONFIG.SUPABASE_URL.includes('PASTE_') && !window.MASAR_CONFIG.SUPABASE_ANON_KEY.includes('PASTE_')) {
  window.MASAR_SUPABASE = window.supabase.createClient(window.MASAR_CONFIG.SUPABASE_URL, window.MASAR_CONFIG.SUPABASE_ANON_KEY);
}
