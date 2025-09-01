// Cache for storing recent responses to avoid duplicate API calls
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Function to generate cache key
const getCacheKey = (query) => {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
};

// Check cache before making API call
export const getCachedResponse = (query) => {
  const key = getCacheKey(query);
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response;
  }
  
  return null;
};

// Store response in cache
export const setCachedResponse = (query, response) => {
  const key = getCacheKey(query);
  responseCache.set(key, {
    response,
    timestamp: Date.now()
  });
  
  // Clean up old cache entries
  if (responseCache.size > 100) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
};

// Clear cache on startup
export const clearResponseCache = () => {
    responseCache.clear();
}