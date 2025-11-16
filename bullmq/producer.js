import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import 'dotenv/config.js';
import fs from 'fs/promises';
import path from 'path';

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
        const agentsDir = 'Agents';
        
        // Ensure Agents directory exists
        await fs.mkdir(agentsDir, { recursive: true });
        
        // Write results_summary.csv
        if (data.summary) {
            const summaryPath = path.join(agentsDir, 'results_summary.csv');
            await fs.writeFile(summaryPath, data.summary, 'utf-8');
            console.log('✅ Saved results_summary.csv');
        }
        
        // Write each agent's data
        for (const [agentName, agentData] of Object.entries(data.agents)) {
            const agentPath = path.join(agentsDir, agentName);
            await fs.mkdir(agentPath, { recursive: true });
            
            // Write obstacle folders
            for (const [obstacleFolder, obstacleData] of Object.entries(agentData)) {
                const obstaclePath = path.join(agentPath, obstacleFolder);
                await fs.mkdir(obstaclePath, { recursive: true });
                
                // Write map.xml
                if (obstacleData.map_xml) {
                    const mapXmlPath = path.join(obstaclePath, 'map.xml');
                    await fs.writeFile(mapXmlPath, obstacleData.map_xml, 'utf-8');
                }
                
                // Write map_metadata.json
                if (obstacleData.map_metadata) {
                    const metadataPath = path.join(obstaclePath, 'map_metadata.json');
                    await fs.writeFile(metadataPath, JSON.stringify(obstacleData.map_metadata, null, 2), 'utf-8');
                }
                
                // Write trajectories
                if (obstacleData.trajectories && Object.keys(obstacleData.trajectories).length > 0) {
                    const trajectoriesPath = path.join(obstaclePath, 'trajectories');
                    await fs.mkdir(trajectoriesPath, { recursive: true });
                    
                    for (const [trajFile, trajData] of Object.entries(obstacleData.trajectories)) {
                        const trajPath = path.join(trajectoriesPath, trajFile);
                        await fs.writeFile(trajPath, JSON.stringify(trajData, null, 2), 'utf-8');
                    }
                }
            }
            
            console.log(`✅ Saved ${agentName} data`);
        }
        
        console.log('🎉 All agents data saved successfully');
    } catch (err) {
        console.error('❌ Error saving agents data:', err);
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
        
        // Save the data to Agents folder
        await saveAgentsData(result.data);

    } catch (error) {
        console.error('❌ Failed to add job:', error.message);
        process.exit(1);
    }
}