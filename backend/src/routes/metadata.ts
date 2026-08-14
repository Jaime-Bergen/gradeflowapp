import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

const defaultReportPreferences = {
  groupSubjectOrder: {},
  subjectPreferences: {},
  primaryWeightingEnabled: false,
  primaryWeightPercent: 60,
};

// Get user metadata
router.get('/', async (req: AuthRequest, res) => {
  const db = getDB();
  try {
    // Get user metadata
    const { rows } = await db.query(
      'SELECT * FROM user_metadata WHERE user_id = $1',
      [req.user!.id]
    );
    
    // Calculate current counts
    const studentCount = await db.query(
      'SELECT COUNT(*) as count FROM students WHERE user_id = $1',
      [req.user!.id]
    );
    const subjectCount = await db.query(
      'SELECT COUNT(*) as count FROM subjects WHERE user_id = $1',
      [req.user!.id]
    );
    const gradeCount = await db.query(
      `SELECT COUNT(*) as count FROM grades g 
       JOIN students s ON g.student_id = s.id 
       WHERE s.user_id = $1`,
      [req.user!.id]
    );
    
    if (rows.length === 0) {
      // Create default metadata if none exists
      const result = await db.query(`
        INSERT INTO user_metadata (user_id, data_version)
        VALUES ($1, $2)
        RETURNING *
      `, [req.user!.id, '2.0.0']);
      
      res.json({
        ...result.rows[0],
        student_count: parseInt(studentCount.rows[0].count),
        subject_count: parseInt(subjectCount.rows[0].count),
        grade_count: parseInt(gradeCount.rows[0].count)
      });
    } else {
      res.json({
        ...rows[0],
        student_count: parseInt(studentCount.rows[0].count),
        subject_count: parseInt(subjectCount.rows[0].count),
        grade_count: parseInt(gradeCount.rows[0].count)
      });
    }
  } catch (err) {
    console.error('Error fetching user metadata:', err);
    res.status(500).json({ error: 'Failed to fetch user metadata' });
  }
});

// Get data stats (replaces KV getDataStats)
router.get('/stats', async (req: AuthRequest, res) => {
  const db = getDB();
  try {
    // Get total counts across all users
    const totalUsers = await db.query('SELECT COUNT(*) as count FROM users WHERE is_active = true');
    const totalStudents = await db.query('SELECT COUNT(*) as count FROM students');
    const totalSubjects = await db.query('SELECT COUNT(*) as count FROM subjects');
    const totalGrades = await db.query('SELECT COUNT(*) as count FROM grades');
    
    // Get user's metadata for last update info
    const userMetadata = await db.query(
      'SELECT updated_at FROM user_metadata WHERE user_id = $1',
      [req.user!.id]
    );
    
    // Calculate approximate storage size (simplified)
    const storageSize = parseInt(totalStudents.rows[0].count) * 100 + 
                       parseInt(totalSubjects.rows[0].count) * 50 + 
                       parseInt(totalGrades.rows[0].count) * 25;
    
    res.json({
      totalUsers: parseInt(totalUsers.rows[0].count),
      totalStudents: parseInt(totalStudents.rows[0].count),
      totalSubjects: parseInt(totalSubjects.rows[0].count),
      totalGrades: parseInt(totalGrades.rows[0].count),
      storageSize,
      lastBackup: userMetadata.rows[0]?.updated_at
    });
  } catch (err) {
    console.error('Error getting data stats:', err);
    res.status(500).json({ error: 'Failed to get data stats' });
  }
});

// Get report preferences for the active/requested school year
router.get('/report-preferences', async (req: AuthRequest, res) => {
  const db = getDB();

  if (!req.userId || !req.schoolYearId) {
    return res.status(401).json({ error: 'Missing user or school year context' });
  }

  try {
    const result = await db.query(
      `SELECT preferences
       FROM report_preferences
       WHERE user_id = $1 AND school_year_id = $2
       LIMIT 1`,
      [req.userId, req.schoolYearId]
    );

    const preferences = result.rows[0]?.preferences || defaultReportPreferences;
    res.json({ preferences });
  } catch (err) {
    console.error('Error fetching report preferences:', err);
    res.status(500).json({ error: 'Failed to fetch report preferences' });
  }
});

// Save report preferences for the active/requested school year
router.put('/report-preferences', async (req: AuthRequest, res) => {
  const db = getDB();

  if (!req.userId || !req.schoolYearId) {
    return res.status(401).json({ error: 'Missing user or school year context' });
  }

  const input = req.body?.preferences;
  if (!input || typeof input !== 'object') {
    return res.status(400).json({ error: 'preferences object is required' });
  }

  const primaryWeight = Number(input.primaryWeightPercent);
  const rawSubjectPreferences = typeof input.subjectPreferences === 'object' && input.subjectPreferences
    ? input.subjectPreferences
    : {};

  const sanitizedSubjectPreferences: Record<string, { displayMode: 'percentage' | 'letter' | 'gpa'; tier: 'primary' | 'secondary' }> = {};
  Object.entries(rawSubjectPreferences).forEach(([subjectId, value]: [string, any]) => {
    if (!subjectId || !value || typeof value !== 'object') return;
    const displayMode = value.displayMode === 'letter' || value.displayMode === 'gpa' ? value.displayMode : 'percentage';
    const tier = value.tier === 'primary' ? 'primary' : 'secondary';
    sanitizedSubjectPreferences[subjectId] = { displayMode, tier };
  });

  const sanitizedPreferences = {
    groupSubjectOrder: typeof input.groupSubjectOrder === 'object' && input.groupSubjectOrder ? input.groupSubjectOrder : {},
    subjectPreferences: sanitizedSubjectPreferences,
    primaryWeightingEnabled: Boolean(input.primaryWeightingEnabled),
    primaryWeightPercent: Number.isFinite(primaryWeight)
      ? Math.max(0, Math.min(100, primaryWeight))
      : 60,
  };

  try {
    const result = await db.query(
      `INSERT INTO report_preferences (user_id, school_year_id, preferences)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id, school_year_id)
       DO UPDATE SET
         preferences = EXCLUDED.preferences,
         updated_at = CURRENT_TIMESTAMP
       RETURNING preferences`,
      [req.userId, req.schoolYearId, JSON.stringify(sanitizedPreferences)]
    );

    res.json({ preferences: result.rows[0].preferences });
  } catch (err) {
    console.error('Error saving report preferences:', err);
    res.status(500).json({ error: 'Failed to save report preferences' });
  }
});

export default router;
