// Vercel Blob configuration
const BLOB_TOKEN = "vercel_blob_rw_w7KlaGajSo3g1jFV_ndj47gz8Lu63fxKAAclzEP3DVUsoTg";

// Cache for blob listings to avoid repeated API calls
let blobCache = null;

/**
 * List all files in the Agents folder from Vercel Blob
 */
async function listAgentsFiles() {
  if (blobCache) {
    return blobCache;
  }

  // Use the Vercel Blob API endpoint with token in URL
  const url = `https://w7klagajso3g1jfv.public.blob.vercel-storage.com`;
  
  try {
    // For client-side access, we'll construct URLs directly
    // Since Vercel Blob stores are public, we can access files directly
    console.log('Note: Using direct blob access. Listing not available client-side.');
    
    // Return empty array - we'll construct URLs directly
    blobCache = [];
    return blobCache;
  } catch (error) {
    console.error('Error with blob storage:', error);
    throw error;
  }
}

/**
 * Get the URL for a specific file in the Agents folder
 */
function getAgentFileUrl(agentType, obstacleCount, fileName) {
  // Construct direct URL to the blob storage
  // Extract the store ID from the token (w7klagajso3g1jfv from the token)
  const storeId = 'w7klagajso3g1jfv';
  
  // Construct the expected path
  let filePath;
  if (fileName.includes('trajectory')) {
    filePath = `Agents/${agentType}/obstacles_${obstacleCount}/trajectories/${fileName}`;
  } else {
    filePath = `Agents/${agentType}/obstacles_${obstacleCount}/${fileName}`;
  }
  
  // Construct the public URL
  const url = `https://${storeId}.public.blob.vercel-storage.com/${filePath}`;
  
  return url;
}

/**
 * Fetch XML file from Vercel Blob
 */
async function fetchAgentXML(agentType, obstacleCount) {
  try {
    const url = getAgentFileUrl(agentType, obstacleCount, 'map.xml');
    console.log('Fetching XML from:', url);
    const response = await fetch(url, {
      cache: 'reload'  // Force revalidation with server
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch XML: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error('Error fetching XML from blob:', error);
    throw error;
  }
}

/**
 * Fetch metadata JSON from Vercel Blob
 */
async function fetchAgentMetadata(agentType, obstacleCount) {
  try {
    const url = getAgentFileUrl(agentType, obstacleCount, 'map_metadata.json');
    console.log('Fetching metadata from:', url);
    const response = await fetch(url, {
      cache: 'reload'  // Force revalidation with server
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching metadata from blob:', error);
    throw error;
  }
}

/**
 * Fetch trajectory JSON from Vercel Blob
 */
async function fetchAgentTrajectory(agentType, obstacleCount) {
  try {
    const url = getAgentFileUrl(agentType, obstacleCount, 'trajectory.json');
    console.log('Fetching trajectory from:', url);
    const response = await fetch(url, {
      cache: 'reload'  // Force revalidation with server
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trajectory: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching trajectory from blob:', error);
    throw error;
  }
}

/**
 * Clear the blob cache (useful for refreshing data)
 */
function clearBlobCache() {
  blobCache = null;
}

export {
  listAgentsFiles,
  getAgentFileUrl,
  fetchAgentXML,
  fetchAgentMetadata,
  fetchAgentTrajectory,
  clearBlobCache
};
