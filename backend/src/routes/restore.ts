import express from 'express';
const multer = require('multer');
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { getDB } from '../database/connection';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { PoolClient } from 'pg';

// Extend AuthRequest to include multer file
interface RestoreRequest extends AuthRequest {
  file?: any; // Multer file object
}

const router = express.Router();

// Configure multer for file uploads (JSON and SQL files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for SQL dumps
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.mimetype === 'application/sql' || file.originalname.endsWith('.sql')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON and SQL files are allowed'));
    }
  }
});

// Create full database backup (PostgreSQL dump)
router.post('/backup/sql', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `gradeflow-full-backup-${timestamp}.sql`;
    const tempPath = path.join(__dirname, '../../temp', filename);
    
    // Ensure temp directory exists
    await fs.mkdir(path.dirname(tempPath), { recursive: true });
    
    const pgDump = spawn('pg_dump', [
      process.env.DATABASE_URL!,
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--file', tempPath
    ]);
    let responseHandled = false;
    
    pgDump.on('close', async (code) => {
      if (responseHandled) return;
      responseHandled = true;
      
      if (code === 0) {
        try {
          const fileBuffer = await fs.readFile(tempPath);
          
          res.setHeader('Content-Type', 'application/sql');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(fileBuffer);
          
          // Clean up temp file
          await fs.unlink(tempPath);
        } catch (error) {
          console.error('Error reading dump file:', error);
          res.status(500).json({ error: 'Failed to read backup file' });
        }
      } else {
        res.status(500).json({ error: 'Database backup failed' });
      }
    });
    
    pgDump.on('error', (error) => {
      if (responseHandled) return;
      responseHandled = true;
      
      console.error('pg_dump error:', error);
      res.status(500).json({ error: 'Database backup failed' });
    });
    
  } catch (error) {
    console.error('Backup failed:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Restore from SQL dump (ADMIN ONLY - full database restore)
router.post('/restore/sql', authenticateToken, upload.single('backupFile'), async (req: RestoreRequest, res) => {
  try {
    // Check if user is admin (you may want to add an admin check here)
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file provided' });
    }
    
    const timestamp = Date.now();
    const tempPath = path.join(__dirname, '../../temp', `restore-${timestamp}.sql`);
    
    // Write uploaded file to temp location
    await fs.mkdir(path.dirname(tempPath), { recursive: true });
    await fs.writeFile(tempPath, req.file.buffer);
    
    const psql = spawn('psql', [
      process.env.DATABASE_URL!,
      '--file', tempPath
    ]);
    
    let errorOutput = '';
    
    psql.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    psql.on('close', async (code) => {
      // Clean up temp file
      await fs.unlink(tempPath);
      
      if (code === 0) {
        res.json({ success: true, message: 'Database restored successfully' });
      } else {
        console.error('psql error:', errorOutput);
        res.status(500).json({ error: 'Database restore failed', details: errorOutput });
      }
    });
    
    psql.on('error', async (error) => {
      await fs.unlink(tempPath);
      console.error('psql spawn error:', error);
      res.status(500).json({ error: 'Database restore failed' });
    });
    
  } catch (error) {
    console.error('SQL restore failed:', error);
    res.status(500).json({ error: 'Failed to restore database' });
  }
});

// Restore data from JSON backup (user-specific data only)
router.post('/restore/json', authenticateToken, upload.single('backupFile'), async (req: RestoreRequest, res) => {
  const db = getDB();
  let client: PoolClient | null = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file provided' });
    }

    // Parse the backup file
    const backupData = JSON.parse(req.file.buffer.toString());
    
    // Validate backup format
    if (!validateBackupFormat(backupData)) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    const userId = req.userId!;
    const restoreOptions = {
      mergeData: req.body.mergeData === 'true',
      updateSettings: req.body.updateSettings === 'true'
    };

    // Get database client and start transaction
    client = await db.connect();
    await client.query('BEGIN');

    let restoredCounts = {
      students: 0,
      subjects: 0,
      grades: 0,
      lessons: 0,
      gradeCategoryTypes: 0,
      studentGroups: 0,
      settingsUpdated: false
    };

    // Restore students
    if (backupData.students && Array.isArray(backupData.students)) {
      for (const student of backupData.students) {
        if (restoreOptions.mergeData) {
          // Check if student exists
          const existing = await client.query(
            'SELECT id FROM students WHERE email = $1 AND user_id = $2',
            [student.email, userId]
          );
          
          if (existing.rows.length === 0) {
            await client.query(
              'INSERT INTO students (name, email, grade_level, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
              [student.name, student.email, student.grade_level, userId, student.created_at || new Date().toISOString(), student.updated_at || new Date().toISOString()]
            );
            restoredCounts.students++;
          }
        } else {
          await client.query(
            'INSERT INTO students (name, email, grade_level, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [student.name, student.email, student.grade_level, userId, student.created_at || new Date().toISOString(), student.updated_at || new Date().toISOString()]
          );
          restoredCounts.students++;
        }
      }
    }

    // Restore subjects
    if (backupData.subjects && Array.isArray(backupData.subjects)) {
      for (const subject of backupData.subjects) {
        if (restoreOptions.mergeData) {
          const existing = await client.query(
            'SELECT id FROM subjects WHERE name = $1 AND user_id = $2',
            [subject.name, userId]
          );
          
          if (existing.rows.length === 0) {
            await client.query(
              'INSERT INTO subjects (name, description, color, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
              [subject.name, subject.description, subject.color, userId, subject.created_at || new Date().toISOString(), subject.updated_at || new Date().toISOString()]
            );
            restoredCounts.subjects++;
          }
        } else {
          await client.query(
            'INSERT INTO subjects (name, description, color, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [subject.name, subject.description, subject.color, userId, subject.created_at || new Date().toISOString(), subject.updated_at || new Date().toISOString()]
          );
          restoredCounts.subjects++;
        }
      }
    }

    // Get ID mappings for foreign key relationships
    const studentMap = new Map();
    const subjectMap = new Map();
    
    // Map original student IDs to new IDs
    const studentsResult = await client.query('SELECT id, name, email FROM students WHERE user_id = $1', [userId]);
    for (const student of studentsResult.rows) {
      const originalStudent = backupData.students?.find((s: any) => s.name === student.name && s.email === student.email);
      if (originalStudent) {
        studentMap.set(originalStudent.id, student.id);
      }
    }

    // Map original subject IDs to new IDs
    const subjectsResult = await client.query('SELECT id, name FROM subjects WHERE user_id = $1', [userId]);
    for (const subject of subjectsResult.rows) {
      const originalSubject = backupData.subjects?.find((s: any) => s.name === subject.name);
      if (originalSubject) {
        subjectMap.set(originalSubject.id, subject.id);
      }
    }

    // Restore lessons
    if (backupData.lessons && Array.isArray(backupData.lessons)) {
      for (const lesson of backupData.lessons) {
        const newSubjectId = subjectMap.get(lesson.subject_id || lesson.subjectId);
        if (newSubjectId) {
          if (restoreOptions.mergeData) {
            const existing = await client.query(
              'SELECT id FROM lessons WHERE title = $1 AND subject_id = $2',
              [lesson.title, newSubjectId]
            );
            
            if (existing.rows.length === 0) {
              await client.query(
                'INSERT INTO lessons (title, description, subject_id, user_id, lesson_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [lesson.title, lesson.description, newSubjectId, userId, lesson.lesson_date, lesson.created_at || new Date().toISOString(), lesson.updated_at || new Date().toISOString()]
              );
              restoredCounts.lessons++;
            }
          } else {
            await client.query(
              'INSERT INTO lessons (title, description, subject_id, user_id, lesson_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
              [lesson.title, lesson.description, newSubjectId, userId, lesson.lesson_date, lesson.created_at || new Date().toISOString(), lesson.updated_at || new Date().toISOString()]
            );
            restoredCounts.lessons++;
          }
        }
      }
    }

    // Restore grade category types
    if (backupData.gradeCategoryTypes && Array.isArray(backupData.gradeCategoryTypes)) {
      for (const category of backupData.gradeCategoryTypes) {
        if (restoreOptions.mergeData) {
          const existing = await client.query(
            'SELECT id FROM grade_category_types WHERE name = $1 AND user_id = $2',
            [category.name, userId]
          );
          
          if (existing.rows.length === 0) {
            await client.query(
              'INSERT INTO grade_category_types (name, weight, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
              [category.name, category.weight, userId, category.created_at || new Date().toISOString(), category.updated_at || new Date().toISOString()]
            );
            restoredCounts.gradeCategoryTypes++;
          }
        } else {
          await client.query(
            'INSERT INTO grade_category_types (name, weight, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
            [category.name, category.weight, userId, category.created_at || new Date().toISOString(), category.updated_at || new Date().toISOString()]
          );
          restoredCounts.gradeCategoryTypes++;
        }
      }
    }

    // Restore student groups
    if (backupData.studentGroups && Array.isArray(backupData.studentGroups)) {
      for (const group of backupData.studentGroups) {
        if (restoreOptions.mergeData) {
          const existing = await client.query(
            'SELECT id FROM student_groups WHERE name = $1 AND user_id = $2',
            [group.name, userId]
          );
          
          if (existing.rows.length === 0) {
            await client.query(
              'INSERT INTO student_groups (name, description, color, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
              [group.name, group.description, group.color, userId, group.created_at || new Date().toISOString(), group.updated_at || new Date().toISOString()]
            );
            restoredCounts.studentGroups++;
          }
        } else {
          await client.query(
            'INSERT INTO student_groups (name, description, color, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [group.name, group.description, group.color, userId, group.created_at || new Date().toISOString(), group.updated_at || new Date().toISOString()]
          );
          restoredCounts.studentGroups++;
        }
      }
    }

    // Restore grades (must be last due to foreign key dependencies)
    if (backupData.grades && Array.isArray(backupData.grades)) {
      for (const grade of backupData.grades) {
        const newStudentId = studentMap.get(grade.student_id);
        const newSubjectId = subjectMap.get(grade.subject_id);
        
        if (newStudentId && newSubjectId) {
          if (restoreOptions.mergeData) {
            const existing = await client.query(
              'SELECT id FROM grades WHERE student_id = $1 AND subject_id = $2 AND assignment_name = $3',
              [newStudentId, newSubjectId, grade.assignment_name]
            );
            
            if (existing.rows.length === 0) {
              await client.query(
                'INSERT INTO grades (student_id, subject_id, assignment_name, grade_value, max_points, category, date_assigned, date_due, notes, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
                [newStudentId, newSubjectId, grade.assignment_name, grade.grade_value, grade.max_points, grade.category, grade.date_assigned, grade.date_due, grade.notes, userId, grade.created_at || new Date().toISOString(), grade.updated_at || new Date().toISOString()]
              );
              restoredCounts.grades++;
            }
          } else {
            await client.query(
              'INSERT INTO grades (student_id, subject_id, assignment_name, grade_value, max_points, category, date_assigned, date_due, notes, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
              [newStudentId, newSubjectId, grade.assignment_name, grade.grade_value, grade.max_points, grade.category, grade.date_assigned, grade.date_due, grade.notes, userId, grade.created_at || new Date().toISOString(), grade.updated_at || new Date().toISOString()]
            );
            restoredCounts.grades++;
          }
        }
      }
    }

    // Restore school settings
    if (restoreOptions.updateSettings && backupData.schoolSettings) {
      const settings = backupData.schoolSettings;
      await client.query(
        'UPDATE users SET school_name = $1, first_day_of_school = $2, grading_periods = $3, updated_at = $4 WHERE id = $5',
        [
          settings.schoolName || null,
          settings.firstDayOfSchool || null,
          settings.gradingPeriods || 6,
          new Date().toISOString(),
          userId
        ]
      );
      restoredCounts.settingsUpdated = true;
    }

    // Commit transaction
    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Data restored successfully',
      restored: restoredCounts,
      metadata: {
        exportedAt: backupData.exportedAt,
        exportedBy: backupData.exportedBy,
        version: backupData.version
      }
    });

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('JSON restore failed:', error);
    res.status(500).json({ 
      error: 'Failed to restore data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Validate backup file format
function validateBackupFormat(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Check for required structure
  const hasValidStructure = (
    Array.isArray(data.students) ||
    Array.isArray(data.subjects) ||
    Array.isArray(data.grades) ||
    Array.isArray(data.lessons) ||
    Array.isArray(data.gradeCategoryTypes) ||
    Array.isArray(data.studentGroups) ||
    data.schoolSettings
  );

  return hasValidStructure;
}

export default router;
