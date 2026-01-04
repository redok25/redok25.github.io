/**
 * Visitor Counter Configuration
 * JSONBin.io API Settings
 */

const VISITOR_CONFIG = {
  // JSONBin.io API Configuration
  JSONBIN_API_KEY: '$2a$10$raBke8RlM6i7cfGKrygMvuqlpC1bO3C.OPodRorPCDaGFU1NKveVK',
  JSONBIN_BIN_ID: null, // Will be created automatically on first run
  
  // API Endpoints
  JSONBIN_BASE_URL: 'https://api.jsonbin.io/v3',
  
  // Feature Flags
  USE_JSONBIN: true, // Set to false to use localStorage only
  FALLBACK_TO_LOCALSTORAGE: true, // Fallback if JSONBin fails
  
  // Storage Keys
  STORAGE_KEY: 'portfolio_visitor_data',
  FINGERPRINT_KEY: 'portfolio_visitor_id',
  BIN_ID_KEY: 'portfolio_jsonbin_id',
  
  // Settings
  DEBUG: false // Set to true for console logs
};

// Helper function for debug logging
function debugLog(...args) {
  if (VISITOR_CONFIG.DEBUG) {
    console.log('[VisitorCounter]', ...args);
  }
}
