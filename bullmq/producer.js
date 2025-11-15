import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import 'dotenv/config.js';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    tls: {
        rejectUnauthorized: false
    },
    retryStrategy: (times) => {
        if (times > 5) {
            console.error('❌ Failed to connect to Redis after 5 retries');
            process.exit(1);
        }
        return Math.min(times * 100, 3000);
    }
});

connection.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

connection.on('connect', () => {
    console.log('✅ Connected to Redis');
});

const dataQueue = new Queue("refreshDataQueue", { connection });

export async function init() {
    try {
        // 10 minutes interval to add a job
        setInterval(async () => {
            const res = await dataQueue.add("calling data refresh", {
                body: `refresh number ${Math.random()}`
            });
            console.log("✅ Job added with ID:", res.id);
            process.exit(0);

        }, 10 * 60 * 1000);

        // Initial job addition
        const res = await dataQueue.add("calling data refresh", {
            body: `refresh number ${Math.random()}`
        });
        console.log("✅ Job added with ID:", res.id);

    } catch (error) {
        console.error('❌ Failed to add job:', error.message);
        process.exit(1);
    }
}

init();