/**
 * Storage Manager
 * 
 * Provides a unified interface for working with Chrome storage
 * with convenient methods for getting and setting data.
 */

class StorageManager {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
  }
  
  /**
   * Initialize the storage manager
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('Storage manager initialized');
  }
  
  /**
   * Get a value from storage
   * 
   * @param {string|Array<string>} keys - Key or keys to retrieve
   * @param {Object} defaultValues - Default values if keys don't exist
   * @returns {Promise<any>} - The retrieved values
   */
  async get(keys, defaultValues = {}) {
    try {
      // If using an array of keys, create a default object
      if (Array.isArray(keys) && !defaultValues) {
        defaultValues = {};
        keys.forEach(key => defaultValues[key] = null);
      }
      
      const result = await chrome.storage.local.get(keys);
      
      // Update cache with retrieved values
      if (typeof keys === 'string') {
        this.cache.set(keys, result[keys]);
      } else if (Array.isArray(keys)) {
        keys.forEach(key => {
          this.cache.set(key, result[key]);
        });
      } else {
        // Keys is an object with default values
        Object.keys(keys).forEach(key => {
          this.cache.set(key, result[key]);
        });
      }
      
      // Apply default values for any missing keys
      if (defaultValues) {
        if (typeof keys === 'string') {
          if (result[keys] === undefined) {
            result[keys] = defaultValues;
          }
        } else {
          Object.keys(defaultValues).forEach(key => {
            if (result[key] === undefined) {
              result[key] = defaultValues[key];
            }
          });
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error getting from storage:', error);
      throw error;
    }
  }
  
  /**
   * Set values in storage
   * 
   * @param {Object|string} keyOrObject - Either a key or an object of key-value pairs
   * @param {any} value - Value to store (if key is a string)
   * @returns {Promise<void>}
   */
  async set(keyOrObject, value) {
    try {
      let dataToStore;
      
      if (typeof keyOrObject === 'string') {
        // Store a single key-value pair
        dataToStore = { [keyOrObject]: value };
        this.cache.set(keyOrObject, value);
      } else {
        // Store multiple key-value pairs
        dataToStore = keyOrObject;
        Object.entries(keyOrObject).forEach(([key, val]) => {
          this.cache.set(key, val);
        });
      }
      
      await chrome.storage.local.set(dataToStore);
    } catch (error) {
      console.error('Error setting storage:', error);
      throw error;
    }
  }
  
  /**
   * Remove keys from storage
   * 
   * @param {string|Array<string>} keys - Key or keys to remove
   * @returns {Promise<void>}
   */
  async remove(keys) {
    try {
      // Remove from cache
      if (typeof keys === 'string') {
        this.cache.delete(keys);
      } else if (Array.isArray(keys)) {
        keys.forEach(key => this.cache.delete(key));
      }
      
      // Remove from storage
      await chrome.storage.local.remove(keys);
    } catch (error) {
      console.error('Error removing from storage:', error);
      throw error;
    }
  }
  
  /**
   * Clear all storage
   * 
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      this.cache.clear();
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw error;
    }
  }
  
  /**
   * Get value from cache first, then storage if not in cache
   * 
   * @param {string} key - Key to retrieve
   * @param {any} defaultValue - Default value if key doesn't exist
   * @returns {Promise<any>} - The retrieved value
   */
  async getWithCache(key, defaultValue = null) {
    // Check cache first
    if (this.cache.has(key)) {
      return { [key]: this.cache.get(key) };
    }
    
    // Not in cache, get from storage
    return this.get(key, defaultValue);
  }
}

export default StorageManager;