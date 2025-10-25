import { getDB } from '../database/connection';

/**
 * Creates default student groups for a user if they don't already exist
 * @param userId - The user ID to create groups for
 */
export const createDefaultStudentGroups = async (userId: string): Promise<void> => {
  const db = getDB();
  
  const defaultGroups = [
    { name: 'Grade 1', description: 'First grade students' },
    { name: 'Grade 2', description: 'Second grade students' },
    { name: 'Grade 3', description: 'Third grade students' },
    { name: 'Grade 4', description: 'Fourth grade students' },
    { name: 'Grade 5', description: 'Fifth grade students' },
    { name: 'Grade 6', description: 'Sixth grade students' },
    { name: 'Grade 7', description: 'Seventh grade students' },
    { name: 'Grade 8', description: 'Eighth grade students' },
    { name: 'Grade 9', description: 'Ninth grade students' },
    { name: 'Grade 10', description: 'Tenth grade students' }
  ];

  try {
    // Check if user already has groups
    const existingResult = await db.query(
      'SELECT COUNT(*) as count FROM student_groups WHERE user_id = $1',
      [userId]
    );

    if (existingResult.rows[0].count === '0') {
      // Insert default groups for this user
      for (const group of defaultGroups) {
        await db.query(`
          INSERT INTO student_groups (user_id, name, description)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, name) DO NOTHING
        `, [userId, group.name, group.description]);
      }
      console.log(`✅ Created default student groups for user ${userId}`);
    }
  } catch (error) {
    console.error(`Error creating default student groups for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Creates default grade category types for a user if they don't already exist
 * @param userId - The user ID to create categories for
 */
export const createDefaultGradeCategoryTypes = async (userId: string): Promise<void> => {
  const db = getDB();
  
  const defaultCategories = [
    { name: 'Lesson', color: '#3b82f6', is_default: true, is_active: true },
    { name: 'Test', color: '#ef4444', is_default: false, is_active: true },
    { name: 'Project', color: '#10b981', is_default: false, is_active: false },
    { name: 'Quiz', color: '#f59e0b', is_default: false, is_active: false }
  ];

  try {
    // Check if user already has categories
    const existingResult = await db.query(
      'SELECT COUNT(*) as count FROM grade_category_types WHERE user_id = $1',
      [userId]
    );

    if (existingResult.rows[0].count === '0') {
      // Insert default categories for this user
      for (const category of defaultCategories) {
        await db.query(`
          INSERT INTO grade_category_types (user_id, name, color, is_default, is_active)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, name) DO NOTHING
        `, [userId, category.name, category.color, category.is_default, category.is_active]);
      }
      console.log(`✅ Created default grade category types for user ${userId}`);
    }
  } catch (error) {
    console.error(`Error creating default grade category types for user ${userId}:`, error);
    throw error;
  }
};