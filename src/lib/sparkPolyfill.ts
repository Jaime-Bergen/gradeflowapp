// Polyfill for spark.kv to use backend API instead
import { apiClient } from './api';

interface SparkKV {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const sparkKV: SparkKV = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await apiClient.kvGet<T>(key);
    } catch (error) {
      console.error('Error getting KV value:', error);
      return undefined;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await apiClient.kvSet(key, value);
    } catch (error) {
      console.error('Error setting KV value:', error);
      throw error;
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await apiClient.kvDelete(key);
    } catch (error) {
      console.error('Error deleting KV value:', error);
      throw error;
    }
  },

  async keys(): Promise<string[]> {
    try {
      return await apiClient.kvKeys();
    } catch (error) {
      console.error('Error getting KV keys:', error);
      return [];
    }
  }
};

// Create global spark object for compatibility
declare global {
  interface Window {
    spark: {
      kv: SparkKV;
    };
  }
}

// Set up the global spark object
if (typeof window !== 'undefined') {
  window.spark = {
    kv: sparkKV
  };
}

// Also export as a module for direct use
export const spark = {
  kv: sparkKV
};
