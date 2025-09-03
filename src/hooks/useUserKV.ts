import { useState, useEffect, useCallback } from 'react'
import { dataManager } from '@/lib/dataManager'

// Simple KV hook implementation
function useKV<T>(key: string, defaultValue: T) {
  const [data, setData] = useState<T>(defaultValue)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load from localStorage as fallback
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        setData(JSON.parse(stored))
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error)
    } finally {
      setIsLoading(false)
    }
  }, [key])

  const updateData = useCallback((newValue: T | ((current: T) => T)) => {
    const valueToSet = typeof newValue === 'function' 
      ? (newValue as (current: T) => T)(data)
      : newValue

    setData(valueToSet)
    try {
      localStorage.setItem(key, JSON.stringify(valueToSet))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
    }
  }, [key, data])

  return [data, updateData, isLoading] as const
}

/**
 * Enhanced user-scoped KV hook with optimized performance for large datasets
 * Automatically handles data compression, caching, and batch operations
 */
export function useUserKV<T>(key: string, defaultValue: T) {
  const userId = typeof window !== 'undefined' ? window.CURRENT_USER_ID : undefined
  
  // For small data or non-array data, use the original implementation
  if (!Array.isArray(defaultValue) || !userId) {
    const scopedKey = userId ? `user:${userId}:${key}` : key
    return useKV<T>(scopedKey, defaultValue)
  }

  // For large arrays, use the optimized data manager
  const [data, setData] = useState<T>(defaultValue)
  const [isLoading, setIsLoading] = useState(true)

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [key, userId])

  const loadData = async () => {
    if (!userId) {
      setData(defaultValue)
      setIsLoading(false)
      return
    }

    try {
      const result = await dataManager.getBatchData<any>(key)
      setData(result.length > 0 ? result as T : defaultValue)
    } catch (error) {
      console.error(`Failed to load ${key}:`, error)
      setData(defaultValue)
    } finally {
      setIsLoading(false)
    }
  }

  const updateData = useCallback(async (newValue: T | ((current: T) => T)) => {
    if (!userId) return

    try {
      const valueToSet = typeof newValue === 'function' 
        ? (newValue as (current: T) => T)(data)
        : newValue

      await dataManager.setBatchData(key, valueToSet as any[])
      setData(valueToSet)
    } catch (error) {
      console.error(`Failed to update ${key}:`, error)
      throw error
    }
  }, [key, userId, data])

  const deleteData = useCallback(async () => {
    if (!userId) return

    try {
      await dataManager.setBatchData(key, [])
      setData(defaultValue)
    } catch (error) {
      console.error(`Failed to delete ${key}:`, error)
      throw error
    }
  }, [key, userId, defaultValue])

  return [data, updateData, deleteData, isLoading] as const
}

/**
 * Enhanced direct KV operations with user scoping and optimization
 */
export const userKV = {
  async get<T>(key: string): Promise<T[] | undefined> {
    const userId = typeof window !== 'undefined' ? window.CURRENT_USER_ID : undefined
    if (!userId) return undefined

    try {
      return await dataManager.getBatchData<T>(key)
    } catch (error) {
      console.error(`Failed to get ${key}:`, error)
      return undefined
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    const userId = typeof window !== 'undefined' ? window.CURRENT_USER_ID : undefined
    if (!userId) throw new Error('No user session')

    if (Array.isArray(value)) {
      await dataManager.setBatchData(key, value)
    } else {
      // Save to localStorage as fallback
      const scopedKey = `user:${userId}:${key}`
      localStorage.setItem(scopedKey, JSON.stringify(value))
    }
  },

  async delete(key: string): Promise<void> {
    const userId = typeof window !== 'undefined' ? window.CURRENT_USER_ID : undefined
    if (!userId) return

    const scopedKey = `user:${userId}:${key}`
    localStorage.removeItem(scopedKey)
  },

  async keys(): Promise<string[]> {
    const userId = typeof window !== 'undefined' ? window.CURRENT_USER_ID : undefined
    
    if (!userId) return []
    
    const prefix = `user:${userId}:`
    const keys: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        keys.push(key.replace(prefix, ''))
      }
    }
    
    return keys
  },

  /**
   * Get statistics about user's data
   */
  async getStats() {
    return await dataManager.getDataStats()
  },

  /**
   * Create a backup of user's data
   */
  async createBackup(): Promise<string> {
    return await dataManager.createBackup()
  },

  /**
   * Restore user's data from backup
   */
  async restoreBackup(timestamp: string): Promise<boolean> {
    return await dataManager.restoreFromBackup(timestamp)
  },

  /**
   * Clear cache for fresh data reload
   */
  clearCache(): void {
    dataManager.clearCache()
  }
}