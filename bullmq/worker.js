import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import 'dotenv/config.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

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

async function collectAgentsData() {
    try {
        const agentsDir = 'Agents';
        const data = {
            agents: {},
            summary: null
        };

        // Read results_summary.csv
        try {
            const summaryPath = path.join(agentsDir, 'results_summary.csv');
            const summaryContent = await fs.readFile(summaryPath, 'utf-8');
            data.summary = summaryContent;
        } catch (err) {
            console.log('⚠️ No summary file found');
        }

        // Read each agent's data
        const agentFolders = await fs.readdir(agentsDir);
        
        for (const agentName of agentFolders) {
            if (agentName === 'results_summary.csv') continue;
            
            const agentPath = path.join(agentsDir, agentName);
            const stat = await fs.stat(agentPath);
            
            if (!stat.isDirectory()) continue;
            
            data.agents[agentName] = {};
            
            // Read obstacle folders
            const obstacleFolders = await fs.readdir(agentPath);
            
            for (const obstacleFolder of obstacleFolders) {
                const obstaclePath = path.join(agentPath, obstacleFolder);
                const obstacleStat = await fs.stat(obstaclePath);
                
                if (!obstacleStat.isDirectory()) continue;
                
                data.agents[agentName][obstacleFolder] = {
                    map_xml: null,
                    map_metadata: null,
                    trajectories: {}
                };
                
                // Read map.xml
                try {
                    const mapXmlPath = path.join(obstaclePath, 'map.xml');
                    const mapXml = await fs.readFile(mapXmlPath, 'utf-8');
                    data.agents[agentName][obstacleFolder].map_xml = mapXml;
                } catch (err) {
                    console.log(`⚠️ No map.xml for ${agentName}/${obstacleFolder}`);
                }
                
                // Read map_metadata.json
                try {
                    const metadataPath = path.join(obstaclePath, 'map_metadata.json');
                    const metadata = await fs.readFile(metadataPath, 'utf-8');
                    data.agents[agentName][obstacleFolder].map_metadata = JSON.parse(metadata);
                } catch (err) {
                    console.log(`⚠️ No metadata for ${agentName}/${obstacleFolder}`);
                }
                
                // Read trajectories
                const trajectoriesPath = path.join(obstaclePath, 'trajectories');
                try {
                    const trajectoryFiles = await fs.readdir(trajectoriesPath);
                    
                    for (const trajFile of trajectoryFiles) {
                        const trajPath = path.join(trajectoriesPath, trajFile);
                        const trajContent = await fs.readFile(trajPath, 'utf-8');
                        data.agents[agentName][obstacleFolder].trajectories[trajFile] = JSON.parse(trajContent);
                    }
                } catch (err) {
                    console.log(`⚠️ No trajectories for ${agentName}/${obstacleFolder}`);
                }
            }
        }
        
        return data;
    } catch (err) {
        console.error('❌ Error collecting agents data:', err);
        throw err;
    }
}

const worker = new Worker("refreshDataQueue", async job => {
    console.log(`🔄 Processing job ID: ${job.id} with data:`, job.data);
    
    try {
        // Execute the UAV comparison test
        console.log('🚁 Starting UAV comparison test...');
        const { stdout, stderr } = await execAsync('python3 uav_comparison_test_new.py');
        
        if (stdout) console.log('📝 Python output:', stdout);
        if (stderr) console.log('⚠️ Python errors:', stderr);
        
        // Collect all generated data
        console.log('📊 Collecting generated data...');
        const agentsData = await collectAgentsData();
        
        console.log(`✅ Job ID: ${job.id} completed successfully`);
        console.log(`📦 Data collected: ${Object.keys(agentsData.agents).length} agents`);
        
        // Return the complete data structure
        return {
            success: true,
            timestamp: new Date().toISOString(),
            data: agentsData
        };
        
    } catch (error) {
        console.error(`❌ Job ID: ${job.id} failed:`, error.message);
        throw error;
    }
}, { connection });

worker.on('completed', job => {
    console.log(`🎉 Job ID: ${job.id} has been completed successfully.`);
});

worker.on('failed', (job, err) => {
    console.error(`❌ Job ID: ${job.id} has failed with error: ${err.message}`);
});