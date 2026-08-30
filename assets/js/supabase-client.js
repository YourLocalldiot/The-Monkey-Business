// Shared Supabase client. Loaded on every page that needs auth (index.html,
// login.html, signup.html, and any future page with the sidebar/account UI).
// The anon key is meant to be public — see docs/supabase-sql.md — access
// control is enforced by Row Level Security policies on the database side,
// not by keeping this key secret.
(function () {
  var SUPABASE_URL = 'https://iwwoqowlseofkjcnjqlm.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3d29xb3dsc2VvZmtqY25qcWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NTIwMjIsImV4cCI6MjEwMjQyODAyMn0.6KCAhownEtNKbc42LMMTo4X_xJOLbR3xVseUZGnKoEQ';

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.warn('Supabase client library did not load — auth features are unavailable.');
  }
})();
