import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Recursively get all files in a directory
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

async function uploadAgentsFolder() {
  const agentsPath = path.join(__dirname, 'Agents');
  
  if (!fs.existsSync(agentsPath)) {
    console.error('Agents folder not found!');
    return;
  }

  console.log('Starting upload of Agents folder to Vercel Blob...\n');

  // Get all files in the Agents folder
  const allFiles = getAllFiles(agentsPath);
  console.log(`Found ${allFiles.length} files to upload\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const filePath of allFiles) {
    try {
      // Get relative path from Agents folder
      const relativePath = path.relative(agentsPath, filePath);
      // Create blob path (use forward slashes for URLs)
      const blobPath = `Agents/${relativePath.replace(/\\/g, '/')}`;
      
      // Read file content
      const fileContent = fs.readFileSync(filePath);
      
      // Upload to Vercel Blob
      const blob = await put(blobPath, fileContent, {
        access: 'public',
      });

      console.log(`✓ Uploaded: ${blobPath}`);
      console.log(`  URL: ${blob.url}\n`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to upload ${filePath}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n=== Upload Summary ===');
  console.log(`Total files: ${allFiles.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${errorCount}`);
}

// Run the upload
uploadAgentsFolder().catch((error) => {
  console.error('Upload failed:', error);
  process.exit(1);
});
