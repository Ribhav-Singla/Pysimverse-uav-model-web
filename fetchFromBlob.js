import { list } from '@vercel/blob';
import 'dotenv/config';

async function fetchAgentsFolder() {
  try {
    console.log('Fetching Agents folder from Vercel Blob...\n');

    // List all blobs with the 'Agents/' prefix
    const { blobs } = await list({
      prefix: 'Agents/',
    });

    console.log(`Found ${blobs.length} files in Agents folder:\n`);

    // Organize files by folder structure
    const filesByFolder = {};
    
    for (const blob of blobs) {
      console.log(`📄 ${blob.pathname}`);
      console.log(`   URL: ${blob.url}`);
      console.log(`   Size: ${(blob.size / 1024).toFixed(2)} KB`);
      console.log(`   Uploaded: ${new Date(blob.uploadedAt).toLocaleString()}\n`);

      // Group by folder
      const pathParts = blob.pathname.split('/');
      const folder = pathParts.slice(0, -1).join('/');
      if (!filesByFolder[folder]) {
        filesByFolder[folder] = [];
      }
      filesByFolder[folder].push({
        name: pathParts[pathParts.length - 1],
        url: blob.url,
        size: blob.size,
        pathname: blob.pathname
      });
    }

    console.log('\n=== Folder Structure ===');
    for (const [folder, files] of Object.entries(filesByFolder)) {
      console.log(`\n📁 ${folder}/`);
      files.forEach(file => {
        console.log(`   - ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
      });
    }

    // Return the blobs for further processing
    return blobs;

  } catch (error) {
    console.error('Error fetching from Vercel Blob:', error);
    process.exit(1);
  }
}

// Fetch specific file content from blob
async function fetchFileContent(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Error fetching file from ${url}:`, error);
    return null;
  }
}

// Example: Fetch and display content of a specific file
async function fetchSpecificFile(pathname) {
  const { blobs } = await list({
    prefix: pathname,
  });
  
  if (blobs.length === 0) {
    console.log(`File not found: ${pathname}`);
    return null;
  }

  const blob = blobs[0];
  console.log(`\nFetching content of: ${blob.pathname}`);
  const content = await fetchFileContent(blob.url);
  console.log('Content:', content);
  return content;
}

// Run the fetch
fetchAgentsFolder().then(async (blobs) => {
  console.log(`\n✓ Successfully fetched ${blobs.length} files from Vercel Blob`);
  
  // Example: Uncomment to fetch specific file content
  // await fetchSpecificFile('Agents/results_summary.csv');
}).catch((error) => {
  console.error('Fetch failed:', error);
  process.exit(1);
});

// Export functions for use in other files
export { fetchAgentsFolder, fetchFileContent, fetchSpecificFile };
