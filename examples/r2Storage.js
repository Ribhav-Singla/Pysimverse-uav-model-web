// Cloudflare R2 Storage configuration
// Using the Public Development URL from R2 bucket settings
const R2_PUBLIC_URL = "https://pub-9feba5102f904684b1adbddd1998b17d.r2.dev";

// Note: This is the Public Development URL provided by Cloudflare R2
// For production, consider connecting a custom domain for better performance and features

// Cache for file listings to avoid repeated API calls
let r2Cache = null;

/**
 * List all files in the Agents folder from Cloudflare R2
 * Note: For client-side applications, listing requires the bucket to be public
 * or use a presigned URL approach. This implementation assumes direct URL access.
 */
async function listAgentsFiles() {
  if (r2Cache) {
    return r2Cache;
  }

  try {
    console.log('Note: Using direct R2 access. Listing not available client-side.');
    
    // Return empty array - we'll construct URLs directly
    r2Cache = [];
    return r2Cache;
  } catch (error) {
    console.error('Error with R2 storage:', error);
    throw error;
  }
}

/**
 * Get the URL for a specific file in the Agents folder
 * Constructs the R2 public URL based on the file path
 */
function getAgentFileUrl(agentType, obstacleCount, mapId, fileName) {
  // Construct the file path in R2
  let filePath;
  if (fileName.includes('trajectory')) {
    filePath = `Agents/${agentType}/obstacles_${obstacleCount}/map_${mapId}/trajectories/${fileName}`;
  } else {
    filePath = `Agents/${agentType}/obstacles_${obstacleCount}/map_${mapId}/${fileName}`;
  }
  
  // Construct the public R2 URL using r2.dev domain
  // Format: https://<bucket-name>.<account-id>.r2.dev/<file-path>
  const url = `${R2_PUBLIC_URL}/${filePath}`;
  
  return url;
}

/**
 * Fetch XML file from Cloudflare R2
 */
async function fetchAgentXML(agentType, obstacleCount, mapId) {
  try {
    const url = getAgentFileUrl(agentType, obstacleCount, mapId, 'map.xml');
    console.log('Fetching XML from R2:', url);
    const response = await fetch(url, {
      cache: 'reload'  // Force revalidation with server
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch XML: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error('Error fetching XML from R2:', error);
    throw error;
  }
}

/**
 * Fetch metadata JSON from Cloudflare R2
 */
async function fetchAgentMetadata(agentType, obstacleCount, mapId) {
  try {
    const url = getAgentFileUrl(agentType, obstacleCount, mapId, 'map_metadata.json');
    console.log('Fetching metadata from R2:', url);
    const response = await fetch(url, {
      cache: 'reload'  // Force revalidation with server
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching metadata from R2:', error);
    throw error;
  }
}

/**
 * Fetch trajectory JSON from Cloudflare R2
 */
async function fetchAgentTrajectory(agentType, obstacleCount, mapId) {
  try {
    const url = getAgentFileUrl(agentType, obstacleCount, mapId, 'trajectory.json');
    console.log('Fetching trajectory from R2:', url);
    const response = await fetch(url, {
      cache: 'reload'  // Force revalidation with server
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trajectory: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching trajectory from R2:', error);
    throw error;
  }
}

/**
 * Clear the R2 cache (useful for refreshing data)
 */
function clearR2Cache() {
  r2Cache = null;
}

export {
  listAgentsFiles,
  getAgentFileUrl,
  fetchAgentXML,
  fetchAgentMetadata,
  fetchAgentTrajectory,
  clearR2Cache
};
