// Polyfill for spark.kv to use backend API instead
import { apiClient } from './api';
const sparkKV = {
    async get(key) {
        try {
            return await apiClient.kvGet(key);
        }
        catch (error) {
            console.error('Error getting KV value:', error);
            return undefined;
        }
    },
    async set(key, value) {
        try {
            await apiClient.kvSet(key, value);
        }
        catch (error) {
            console.error('Error setting KV value:', error);
            throw error;
        }
    },
    async delete(key) {
        try {
            await apiClient.kvDelete(key);
        }
        catch (error) {
            console.error('Error deleting KV value:', error);
            throw error;
        }
    },
    async keys() {
        try {
            return await apiClient.kvKeys();
        }
        catch (error) {
            console.error('Error getting KV keys:', error);
            return [];
        }
    }
};
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
