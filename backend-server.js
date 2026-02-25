const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// In-memory array for events, mimicking a time-series DB or logs DB (e.g., Supabase eventually)
const eventsDb = [];
const activeDevices = new Set();

app.post('/api/event', (req, res) => {
    try {
        const { device_id, event, mode, one_shot, timestamp, version, platform } = req.body;

        if (!device_id || !event) {
            return res.status(400).json({ error: 'Missing device_id or event' });
        }

        const newEvent = {
            device_id,
            event,
            mode: mode || null,
            one_shot: one_shot !== undefined ? one_shot : null,
            timestamp: timestamp || new Date().toISOString(),
            version,
            platform,
            serverReceivedAt: new Date().toISOString()
        };

        eventsDb.push(newEvent);

        if (event === 'app_opened') {
            activeDevices.add(device_id);
        }

        // Lightweight logging to terminal
        console.log(`[ANALYTICS] ${timestamp} | EVENT: ${event} | DEVICE: ${device_id} | MODE: ${mode || 'N/A'}`);

        return res.status(200).json({ success: true, message: 'Event logged successfully' });
    } catch (err) {
        console.error('Event logging error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/analytics', (req, res) => {
    try {
        const now = new Date();
        const past24hStr = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();

        const eventsLast24h = eventsDb.filter(e => e.timestamp >= past24hStr);
        const optimizeEventsToday = eventsLast24h.filter(e => e.event === 'optimize_used');

        // Calculate most used mode safely
        const modeCounts = {};
        optimizeEventsToday.forEach(e => {
            if (e.mode) {
                modeCounts[e.mode] = (modeCounts[e.mode] || 0) + 1;
            }
        });

        let mostUsedMode = null;
        let highestCount = 0;
        for (const [mode, count] of Object.entries(modeCounts)) {
            if (count > highestCount) {
                highestCount = count;
                mostUsedMode = mode;
            }
        }

        return res.json({
            total_devices: activeDevices.size,
            daily_active_users: new Set(eventsLast24h.map(e => e.device_id)).size,
            optimize_count_today: optimizeEventsToday.length,
            most_used_mode: mostUsedMode,
            events_last_24h: eventsLast24h.length
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to compute analytics' });
    }
});

app.listen(PORT, () => {
    console.log(`PromptLayer Intelligence Backend listening on port ${PORT}`);
    console.log(`POST /api/event - Accept intelligent product events`);
    console.log(`GET  /api/analytics - Dashboard metrics retrieval`);
});
