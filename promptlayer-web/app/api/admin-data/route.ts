import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Force dynamic execution since dashboard data is real-time
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const key = searchParams.get('key');

        // Minimalistic gateway token
        if (!key || key !== process.env.ADMIN_SECRET) {
            return NextResponse.json({ error: 'Unauthorized Access' }, { status: 401 });
        }

        const now = new Date();
        // Use proper ISO boundaries
        const past24hStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const past7dStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // In a hyper-scale production setup, this would be computed by a materialized 
        // view or an RPC script via PostgreSQL. Here we use naive JS filtering against 
        // the last rolling week of metrics to avoid deep SQL complexity in the prototype.

        const { data: weeklyEvents, error } = await supabaseAdmin
            .from('events')
            .select('device_id, event, mode, platform, timestamp')
            .gte('timestamp', past7dStr);

        if (error) {
            console.error(error);
            return NextResponse.json({ error: 'Service Unavailable' }, { status: 503 });
        }

        const events = weeklyEvents || [];

        // Slice today's data specifically from the week payload
        const recentEvents = events.filter(e => e.timestamp >= past24hStr);
        const dauTodayCount = new Set(recentEvents.map(e => e.device_id)).size;
        const dauWeeklyCount = new Set(events.map(e => e.device_id)).size;

        // Filter Optimization events specifically
        const optimizeEventsToday = recentEvents.filter(e => e.event === 'optimize_used');

        // Aggregate Mode frequencies
        const modeCounts: Record<string, number> = {};
        const platformCounts: Record<string, number> = {};

        optimizeEventsToday.forEach(e => {
            if (e.mode) {
                modeCounts[e.mode] = (modeCounts[e.mode] || 0) + 1;
            }
        });

        recentEvents.forEach(e => {
            if (e.platform) {
                platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
            }
        });

        // Formatting for Recharts
        const modeUsageData = Object.keys(modeCounts).map(k => ({ name: k, count: modeCounts[k] }));
        const pDistributionData = Object.keys(platformCounts).map(k => ({ name: k, count: platformCounts[k] }));

        // Generate Weekly Timeline (Last 7 Days Series)
        const trendMap: Record<string, Set<string>> = {};
        events.forEach(e => {
            // Group by local 'YYYY-MM-DD' ignoring hours
            const day = e.timestamp.split('T')[0];
            if (!trendMap[day]) trendMap[day] = new Set();
            trendMap[day].add(e.device_id);
        });

        // Sort strictly chronological
        const dauTrend = Object.keys(trendMap).sort().map(date => ({
            date,
            users: trendMap[date].size
        }));

        // Generate most used mode logic
        let mostUsedMode = 'N/A';
        if (modeUsageData.length > 0) {
            modeUsageData.sort((a, b) => b.count - a.count);
            mostUsedMode = modeUsageData[0].name;
        }

        return NextResponse.json({
            metrics: {
                dau_today: dauTodayCount,
                dau_7_day: dauWeeklyCount,
                optimize_count_today: optimizeEventsToday.length,
                most_used_mode: mostUsedMode,
            },
            charts: {
                dau_trend: dauTrend,
                mode_usage: modeUsageData,
                platform_distribution: pDistributionData
            }
        });

    } catch (err) {
        console.error('[API/Admin] Exception:', err);
        return NextResponse.json({ error: 'Internal execution failure' }, { status: 500 });
    }
}
