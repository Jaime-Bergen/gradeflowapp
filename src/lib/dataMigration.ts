import { UserData } from '@/components/UserAuth'

/**
 * Data migration utilities for upgrading from legacy authentication systems
 */

export interface LegacyUserData {
  id: string
  name: string
  email?: string
  isGitHubUser?: boolean
  avatar?: string
}

/**
 * Migrate data from legacy GitHub/local auth system to new email-based system
 * DISABLED: Legacy migration is no longer needed since we're using backend API with database
 */
export async function migrateLegacyData(_newUserData: UserData): Promise<boolean> {
  console.log('Legacy migration disabled - using backend API system')
  // Legacy migration is no longer needed since we're using backend API with database
  return true
}

/**
 * Check if there's any legacy data that needs migration
 * DISABLED: Always returns false since we're using backend API
 */
export async function hasLegacyData(): Promise<boolean> {
  return false
}

/**
 * Get statistics about legacy data
 * DISABLED: Always returns no data since we're using backend API
 */
export async function getLegacyDataStats(): Promise<{ hasData: boolean; recordCount: number }> {
  return { hasData: false, recordCount: 0 }
}