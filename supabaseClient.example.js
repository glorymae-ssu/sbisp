// Copy this file to  js/supabaseClient.js  (skip it if you already have one that exports `supabase`).
// Use ONLY the public "anon" key here. NEVER put the service_role key in GitHub.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://rcjfnnlvksjusolxidfw.supabase.co';
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_PUBLIC_KEY_HERE';   // Supabase > Project Settings > API > anon public

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
