import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { device_id, event, mode, one_shot, timestamp, version, platform } = body;

        // Validate minimum required payload for analytics integrity
        if (!device_id || !event) {
            return NextResponse.json(
                { error: 'Missing required tracking fields: device_id, event' },
                { status: 400 }
            );
        }

        // Attempt to parse external timestamps safely or default to now
        let eventTime = new Date().toISOString();
        try {
            if (timestamp && !isNaN(new Date(timestamp).getTime())) {
                eventTime = new Date(timestamp).toISOString();
            }
        } catch { }

        // We await the insert here so that serverless functions (like Vercel Edge/Lambdas) 
        // do not terminate before the network call completes.
        const { error } = await supabaseAdmin.from('events').insert([
            {
                device_id,
                event,
                mode: mode || null,
                one_shot: one_shot !== undefined && one_shot !== null ? Boolean(one_shot) : null,
                timestamp: eventTime,
                version: version || 'unknown',
                platform: platform || 'unknown',
            },
        ]);

        if (error) {
            console.error('[Supabase Insert Error]', error);
            // We return 500 to let the client retry logic decide, but the client implementation
            // is completely fire-and-forget so it won't crash the desktop app.
            return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API/Event] Exception:', error);
        return NextResponse.json({ error: 'Internal server error processing event' }, { status: 500 });
    }
}
