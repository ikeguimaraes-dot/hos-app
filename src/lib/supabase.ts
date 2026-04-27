import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://afxsrcezmetipzgosdvb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmeHNyY2V6bWV0aXB6Z29zZHZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMzE2MCwiZXhwIjoyMDkwMTk5MTYwfQ.vsGS--pFgMlhhr29hMV8AbUsuETqtlDnFFaU2AcaKIA';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
