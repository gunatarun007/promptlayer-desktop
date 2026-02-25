import { notFound } from 'next/navigation';
import DashboardClient from './DashboardClient';

// Ensure standard server-side render per load to capture realtime metrics
export const dynamic = 'force-dynamic';

export default async function AdminPage({
    searchParams,
}: {
    // Next 15 standard signature
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    // Await search params securely 
    const resolvedParams = await searchParams;
    const key = typeof resolvedParams.key === 'string' ? resolvedParams.key : null;

    if (!key || key !== process.env.ADMIN_SECRET) {
        notFound();
    }

    // Standard Next.js serverless detection pattern for absolute fetch injection
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = process.env.VERCEL_URL ? process.env.VERCEL_URL : 'localhost:3000';

    const res = await fetch(`${protocol}://${host}/api/admin-data?key=${key}`, {
        cache: 'no-store'
    });

    if (!res.ok) {
        return <div className="p-8 text-red-500 font-sans">Error: The analytics endpoint failed to aggregate data. Check Server logs.</div>;
    }

    const data = await res.json();

    return <DashboardClient data={data} />;
}
