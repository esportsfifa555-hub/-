(function () {
  const config = window.SCHOOL_SUPABASE_CONFIG;
  const hasConfig = config &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url) &&
    typeof config.anonKey === "string" &&
    config.anonKey.length > 20 &&
    config.anonKey !== "YOUR_SUPABASE_ANON_KEY" &&
    window.supabase &&
    typeof window.supabase.createClient === "function";

  if (!hasConfig) {
    window.schoolSupabase = null;
    return;
  }

  window.schoolSupabase = window.supabase.createClient(config.url, config.anonKey);
})();
