import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import 'dotenv/config';
import { put } from '@vercel/blob';

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
const queueEvents = new QueueEvents("refreshDataQueue", { connection });

async function saveAgentsData(data) {
    try {
        console.log('🔄 Uploading agents data to Vercel Blob...');
        let uploadCount = 0;
        let errorCount = 0;
        
        // Upload results_summary.csv
        if (data.summary) {
            try {
                const blobPath = 'Agents/results_summary.csv';
                await put(blobPath, data.summary, {
                    access: 'public',
                    contentType: 'text/csv',
                    addRandomSuffix: false,
                    allowOverwrite: true
                });
                console.log('✅ Uploaded results_summary.csv');
                uploadCount++;
            } catch (err) {
                console.error('❌ Failed to upload results_summary.csv:', err.message);
                errorCount++;
            }
        }
        
        // Upload each agent's data
        for (const [agentName, agentData] of Object.entries(data.agents)) {
            console.log(`📤 Uploading ${agentName} data...`);
            
            // Upload obstacle folders
            for (const [obstacleFolder, obstacleData] of Object.entries(agentData)) {
                const basePath = `Agents/${agentName}/${obstacleFolder}`;
                
                // Upload map.xml
                if (obstacleData.map_xml) {
                    try {
                        const blobPath = `${basePath}/map.xml`;
                        await put(blobPath, obstacleData.map_xml, {
                            access: 'public',
                            contentType: 'application/xml',
                            addRandomSuffix: false,
                            allowOverwrite: true
                        });
                        uploadCount++;
                    } catch (err) {
                        console.error(`❌ Failed to upload ${basePath}/map.xml:`, err.message);
                        errorCount++;
                    }
                }
                
                // Upload map_metadata.json
                if (obstacleData.map_metadata) {
                    try {
                        const blobPath = `${basePath}/map_metadata.json`;
                        await put(blobPath, JSON.stringify(obstacleData.map_metadata, null, 2), {
                            access: 'public',
                            contentType: 'application/json',
                            addRandomSuffix: false,
                            allowOverwrite: true
                        });
                        uploadCount++;
                    } catch (err) {
                        console.error(`❌ Failed to upload ${basePath}/map_metadata.json:`, err.message);
                        errorCount++;
                    }
                }
                
                // Upload trajectories
                if (obstacleData.trajectories && Object.keys(obstacleData.trajectories).length > 0) {
                    for (const [trajFile, trajData] of Object.entries(obstacleData.trajectories)) {
                        try {
                            const blobPath = `${basePath}/trajectories/${trajFile}`;
                            await put(blobPath, JSON.stringify(trajData, null, 2), {
                                access: 'public',
                                contentType: 'application/json',
                                addRandomSuffix: false,
                                allowOverwrite: true
                            });
                            uploadCount++;
                        } catch (err) {
                            console.error(`❌ Failed to upload ${basePath}/trajectories/${trajFile}:`, err.message);
                            errorCount++;
                        }
                    }
                }
            }
            
            console.log(`✅ Uploaded ${agentName} data to Vercel Blob`);
        }
        
        console.log(`\n🎉 Upload complete!`);
        console.log(`   ✅ Successful: ${uploadCount} files`);
        console.log(`   ❌ Failed: ${errorCount} files`);
        
        if (errorCount > 0) {
            throw new Error(`Failed to upload ${errorCount} files`);
        }
    } catch (err) {
        console.error('❌ Error uploading agents data to Vercel Blob:', err);
        throw err;
    }
}

export async function init() {
    try {
        // Wake up Render backend
        console.log('🔄 Waking up Render backend...');
        try {
            const response = await fetch('https://pysimverse-uav-model-backend.onrender.com');
            console.log(`✅ Render backend pinged: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.log(`📄 Response: ${text.substring(0, 100)}`);
        } catch (err) {
            console.log('⚠️ Failed to ping Render backend:', err.message);
            console.error('Full error:', err);
        }

        // Add job
        const job = await dataQueue.add("calling data refresh", {
            body: `refresh number ${Math.random()}`
        });
        console.log("✅ Job added with ID:", job.id);
        
        // Wait for the job to complete and get the result
        const result = await job.waitUntilFinished(queueEvents);
        console.log("📦 Job completed with data:", result);
        console.log(`📊 Agents collected: ${Object.keys(result.data.agents).length}`);
        
        // Upload the data to Vercel Blob
        await saveAgentsData(result.data);
        process.exit(0);

    } catch (error) {
        console.error('❌ Failed to add job:', error.message);
        process.exit(1);
    }
}