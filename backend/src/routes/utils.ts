import express from 'express';
import { getDB } from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createDefaultStudentGroups, createDefaultGradeCategoryTypes } from '../database/seedDefaults';

const router = express.Router();

// Fix missing default data for current user
router.post('/fix-defaults', authenticateToken, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;
    
    await createDefaultStudentGroups(userId);
    await createDefaultGradeCategoryTypes(userId);
    
    res.json({ 
      message: 'Default data created successfully',
      success: true 
    });
  } catch (error) {
    console.error('Error creating default data:', error);
    res.status(500).json({ error: 'Failed to create default data' });
  }
});

// Admin endpoint to fix defaults for all users (if needed)
router.post('/admin/fix-all-defaults', authenticateToken, async (req: AuthRequest, res): Promise<void> => {
  try {
    const db = getDB();
    
    // Get all users
    const usersResult = await db.query('SELECT id FROM users');
    const users = usersResult.rows;
    
    let fixed = 0;
    for (const user of users) {
      try {
        await createDefaultStudentGroups(user.id);
        await createDefaultGradeCategoryTypes(user.id);
        fixed++;
      } catch (error) {
        console.error(`Failed to fix defaults for user ${user.id}:`, error);
      }
    }
    
    res.json({ 
      message: `Fixed default data for ${fixed} users`,
      totalUsers: users.length,
      fixed,
      success: true 
    });
  } catch (error) {
    console.error('Error fixing defaults for all users:', error);
    res.status(500).json({ error: 'Failed to fix defaults for all users' });
  }
});

export default router;