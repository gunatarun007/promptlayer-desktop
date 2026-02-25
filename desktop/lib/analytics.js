const { app } = require('electron');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)).catch(() => globalThis.fetch(...args)); // electron native fetch is available but just to be safe

class AnalyticsService {
    constructor(store) {
        this.store = store;
        this.endpoint = 'https://promptlayer.vike.in/api/event';
        this.deviceId = this.getOrCreateDeviceId();
        this.platform = process.platform;
        this.version = app.getVersion();

        // For queueing failed events or avoiding immediate blockage
        this.queue = [];
        this.isFlushing = false;
    }

    getOrCreateDeviceId() {
        let id = this.store.get('deviceId');
        if (!id) {
            id = crypto.randomUUID();
            this.store.set('deviceId', id);
        }
        return id;
    }

    async track(event, metadata = {}) {
        // Ensure strict 1 app_open per day
        if (event === 'app_open') {
            const today = new Date().toISOString().split('T')[0];
            const lastOpen = this.store.get('lastAppOpenDate');
            if (lastOpen === today) return;
            this.store.set('lastAppOpenDate', today);
        }

        const payload = {
            device_id: this.deviceId,
            event,
            timestamp: new Date().toISOString(),
            version: this.version,
            platform: this.platform,
            ...metadata
        };

        this.queue.push(payload);
        this.flush();
    }

    async flush() {
        if (this.isFlushing || this.queue.length === 0) return;
        this.isFlushing = true;

        const currentBatch = [...this.queue];
        this.queue = [];

        try {
            for (const payload of currentBatch) {
                await fetch(this.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(() => {
                    // Silent fail. Do not re-add to queue for simple fire-and-forget.
                });
            }
        } catch (_) {
            // Outermost silent fail
        } finally {
            this.isFlushing = false;
            if (this.queue.length > 0) {
                this.flush();
            }
        }
    }
}

module.exports = AnalyticsService;
