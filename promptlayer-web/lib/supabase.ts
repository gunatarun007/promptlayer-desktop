import { createClient } from '@supabase/supabase-js';

// Validate environment variables are present
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are missing');
}

// Initialize Supabase client with the service role key to bypass RLS securely.
// Ensure this file is ONLY imported on the server/API layer.
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
