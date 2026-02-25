"use client";

import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar,
    PieChart, Pie, Cell
} from 'recharts';
import { Users, Activity, Zap, MonitorSmartphone } from 'lucide-react';

const COLORS = ['#818CF8', '#34D399', '#FBBF24', '#F472B6', '#A78BFA'];

export default function DashboardClient({ data }: { data: any }) {
    const { metrics, charts } = data;

    const MetricCard = ({ title, value, icon: Icon, color }: any) => (
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 flex items-center justify-between transition-all hover:bg-slate-800/80">
            <div>
                <p className="text-slate-400 text-sm font-medium tracking-wide uppercase">{title}</p>
                <h3 className="text-3xl font-bold text-slate-100 mt-2">{value}</h3>
            </div>
            <div className={`p-4 rounded-xl`} style={{ backgroundColor: `${color}15`, color: color }}>
                <Icon size={24} />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-4 md:p-8 selection:bg-indigo-500/30">

            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <header className="mb-10">
                    <h1 className="text-3xl tracking-tight font-extrabold flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
                            <Zap size={18} className="text-white" />
                        </div>
                        PromptLayer Intelligence
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm">Real-time product analytics and user telemetry</p>
                </header>

                {/* Top Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MetricCard title="DAU (Today)" value={metrics.dau_today} icon={Users} color="#818CF8" />
                    <MetricCard title="7-Day Active" value={metrics.dau_7_day} icon={Activity} color="#34D399" />
                    <MetricCard title="Total Optimizations" value={metrics.optimize_count_today} icon={Zap} color="#FBBF24" />
                    <MetricCard title="Top Mode" value={metrics.most_used_mode} icon={MonitorSmartphone} color="#A78BFA" />
                </div>

                {/* Main Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* DAU Line Chart */}
                    <div className="lg:col-span-2 bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
                        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <Activity size={18} className="text-indigo-400" /> Daily Active Users (Last 7 Days)
                        </h3>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={charts.dau_trend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                    <XAxis dataKey="date" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#f1f5f9' }}
                                        itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                                    />
                                    <Line type="monotone" dataKey="users" stroke="#818CF8" strokeWidth={3} dot={{ fill: '#818CF8', r: 4 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Platform Pie Chart */}
                    <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
                        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <MonitorSmartphone size={18} className="text-emerald-400" /> Platform Distribution
                        </h3>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={charts.platform_distribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="count"
                                        stroke="none"
                                    >
                                        {charts.platform_distribution.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex justify-center gap-4 mt-4">
                                {charts.platform_distribution.map((entry: any, index: number) => (
                                    <div key={entry.name} className="flex items-center gap-2 text-xs text-slate-300">
                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                        {entry.name}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Mode Usage Bar Chart */}
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Zap size={18} className="text-amber-400" /> Mode Popularity Breakdown
                    </h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={charts.mode_usage} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} />
                                <XAxis type="number" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} width={120} />
                                <Tooltip
                                    cursor={{ fill: '#334155', opacity: 0.4 }}
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px' }}
                                />
                                <Bar dataKey="count" fill="#A78BFA" radius={[0, 6, 6, 0]} barSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
}
