import { put, list } from '@vercel/blob';
import 'dotenv/config';

async function testBlobAccess() {
  try {
    console.log('Testing blob access...\n');
    
    // Try to list blobs
    const { blobs } = await list({
      limit: 10,
      prefix: 'Agents/'
    });
    
    console.log(`Found ${blobs.length} blobs:\n`);
    
    blobs.forEach(blob => {
      console.log('Path:', blob.pathname);
      console.log('URL:', blob.url);
      console.log('---');
    });
    
    if (blobs.length === 0) {
      console.log('\nNo files found. Please run: node uploadToBlob.js');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testBlobAccess();
