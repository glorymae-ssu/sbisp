// Copy this file to  js/supabaseClient.js  (skip it if you already have one that exports `supabase`).
// Use ONLY the public "anon" key here. NEVER put the service_role key in GitHub.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://rcjfnnlvksjusolxidfw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjamZubmx2a3NqdXNvbHhpZGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MDE1MjgsImV4cCI6MjEwODA3NzUyOH0.SZ71VKMRP6hfzNO1uLZm3ci9n9u3l2QTekKP57y4-ck';   // Supabase > Project Settings > API > anon public

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
