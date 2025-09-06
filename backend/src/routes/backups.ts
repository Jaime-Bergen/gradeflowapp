import express from 'express';
import { getDB } from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Create a backup
router.post('/create', authenticateToken, async (req: AuthRequest, res) => {
  const db = getDB();
  try {
    const timestamp = new Date().toISOString();
    
    // Get all user data
    const students = await db.query(
      'SELECT * FROM students WHERE user_id = $1',
      [req.user!.id]
    );
    const subjects = await db.query(
      'SELECT * FROM subjects WHERE user_id = $1',
      [req.user!.id]
    );
    const grades = await db.query(
      `SELECT g.* FROM grades g 
       JOIN students s ON g.student_id = s.id 
       WHERE s.user_id = $1`,
      [req.user!.id]
    );
    
    const backupData = {
      timestamp,
      version: '2.0.0',
      data: {
        students: students.rows,
        subjects: subjects.rows,
        grades: grades.rows
      },
      metadata: {
        studentCount: students.rows.length,
        subjectCount: subjects.rows.length,
        gradeCount: grades.rows.length
      }
    };
    
    // Store backup
    const { rows } = await db.query(`
      INSERT INTO user_backups (user_id, backup_timestamp, backup_data)
      VALUES ($1, $2, $3)
      RETURNING id, backup_timestamp, created_at
    `, [req.user!.id, timestamp, JSON.stringify(backupData)]);
    
    res.json({
      message: 'Backup created successfully',
      backup: {
        id: rows[0].id,
        timestamp: rows[0].backup_timestamp,
        createdAt: rows[0].created_at,
        ...backupData.metadata
      }
    });
  } catch (err) {
    console.error('Error creating backup:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// List all backups for user
router.get('/list', authenticateToken, async (req: AuthRequest, res) => {
  const db = getDB();
  try {
    const { rows } = await db.query(`
      SELECT id, backup_timestamp, created_at,
             backup_data->>'metadata' as metadata
      FROM user_backups 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [req.user!.id]);
    
    const backups = rows.map(row => ({
      id: row.id,
      timestamp: row.backup_timestamp,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}')
    }));
    
    res.json(backups);
  } catch (err) {
    console.error('Error listing backups:', err);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Restore from backup
router.post('/restore/:timestamp', authenticateToken, async (req: AuthRequest, res) => {
  const { timestamp } = req.params;
  const db = getDB();
  
  try {
    // Get backup data
    const backupResult = await db.query(
      'SELECT backup_data FROM user_backups WHERE user_id = $1 AND backup_timestamp = $2',
      [req.user!.id, timestamp]
    );
    
    if (backupResult.rows.length === 0) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }
    
    const backupData = JSON.parse(backupResult.rows[0].backup_data);
    
    // Start transaction
    await db.query('BEGIN');
    
    try {
      // Clear existing data
      await db.query('DELETE FROM grades WHERE student_id IN (SELECT id FROM students WHERE user_id = $1)', [req.user!.id]);
      await db.query('DELETE FROM students WHERE user_id = $1', [req.user!.id]);
      await db.query('DELETE FROM subjects WHERE user_id = $1', [req.user!.id]);
      
      // Restore students
      for (const student of backupData.data.students) {
        await db.query(
          'INSERT INTO students (id, user_id, name, grade, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [student.id, student.user_id, student.name, student.grade, student.created_at, student.updated_at]
        );
      }
      
      // Restore subjects
      for (const subject of backupData.data.subjects) {
        await db.query(
          'INSERT INTO subjects (id, user_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [subject.id, subject.user_id, subject.name, subject.description, subject.created_at, subject.updated_at]
        );
      }
      
      // Restore grades
      for (const grade of backupData.data.grades) {
        await db.query(
          'INSERT INTO grades (id, student_id, lesson_id, percentage, errors, points, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [grade.id, grade.student_id, grade.lesson_id, grade.percentage, grade.errors, grade.points, grade.created_at, grade.updated_at]
        );
      }
      
      // Update user metadata
      await db.query(`
        INSERT INTO user_metadata (user_id, data_version)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET
          data_version = EXCLUDED.data_version,
          updated_at = CURRENT_TIMESTAMP
      `, [req.user!.id, backupData.version]);
      
      await db.query('COMMIT');
      
      res.json({
        message: 'Backup restored successfully',
        restored: backupData.metadata
      });
    } catch (restoreError) {
      await db.query('ROLLBACK');
      throw restoreError;
    }
  } catch (err) {
    console.error('Error restoring backup:', err);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Delete a backup
router.delete('/:timestamp', authenticateToken, async (req: AuthRequest, res) => {
  const { timestamp } = req.params;
  const db = getDB();
  
  try {
    const result = await db.query(
      'DELETE FROM user_backups WHERE user_id = $1 AND backup_timestamp = $2',
      [req.user!.id, timestamp]
    );
    
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }
    
    res.json({ message: 'Backup deleted successfully' });
  } catch (err) {
    console.error('Error deleting backup:', err);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
});

export default router;
