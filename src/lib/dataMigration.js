/**
 * Migrate data from legacy GitHub/local auth system to new email-based system
 * DISABLED: Legacy migration is no longer needed since we're using backend API with database
 */
export async function migrateLegacyData(_newUserData) {
    console.log('Legacy migration disabled - using backend API system');
    // Legacy migration is no longer needed since we're using backend API with database
    return true;
}
/**
 * Check if there's any legacy data that needs migration
 * DISABLED: Always returns false since we're using backend API
 */
export async function hasLegacyData() {
    return false;
}
/**
 * Get statistics about legacy data
 * DISABLED: Always returns no data since we're using backend API
 */
export async function getLegacyDataStats() {
    return { hasData: false, recordCount: 0 };
}
