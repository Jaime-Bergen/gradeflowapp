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

async function resolvePgDumpBinary(): Promise<string | null> {
  const fromEnv = process.env.PG_DUMP_PATH
  if (fromEnv) {
    try {
      await fs.access(fromEnv)
      return fromEnv
    } catch {
      // Keep searching if env path is invalid
    }
  }

  if (process.platform === 'win32') {
    const candidates: string[] = []
    for (let version = 18; version >= 12; version--) {
      candidates.push(`C:\\Program Files\\PostgreSQL\\${version}\\bin\\pg_dump.exe`)
    }

    for (const candidate of candidates) {
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        // Try next candidate
      }
    }

    return null
  }

  // On non-Windows, assume pg_dump is available via PATH.
  return 'pg_dump'
}

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
    const pgDumpBinary = await resolvePgDumpBinary()
    if (!pgDumpBinary) {
      return res.status(500).json({
        error: 'pg_dump is not installed or not found. Set PG_DUMP_PATH or install PostgreSQL command-line tools.',
      })
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `gradeflow-full-backup-${timestamp}.sql`;
    const tempPath = path.join(__dirname, '../../temp', filename);
    
    // Ensure temp directory exists
    await fs.mkdir(path.dirname(tempPath), { recursive: true });
    
    const pgDump = spawn(pgDumpBinary, [
      process.env.DATABASE_URL!,
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--file', tempPath
    ]);
    let errorOutput = ''

    pgDump.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    let responseHandled = false;
    
    pgDump.on('close', async (code) => {
      if (responseHandled) return;
      responseHandled = true;
      
      if (code === 0) {
        try {
          const fileBuffer = await fs.readFile(tempPath);
          
          res.setHeader('Content-Type', 'application/sql');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.setHeader('X-Backup-Format', 'sql')
          res.send(fileBuffer);
          
          // Clean up temp file
          await fs.unlink(tempPath);
        } catch (error) {
          console.error('Error reading dump file:', error);
          res.status(500).json({ error: 'Failed to read backup file' });
        }
      } else {
        res.status(500).json({
          error: 'Database backup failed',
          details: errorOutput || `pg_dump exited with code ${code}`,
        });
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

    const backupData = JSON.parse(req.file.buffer.toString());
    if (!validateBackupFormat(backupData)) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }

    const payload = backupData?.data && typeof backupData.data === 'object' ? backupData.data : backupData;
    const userId = req.userId!;
    const nowIso = new Date().toISOString();
    const toArray = (val: any) => (Array.isArray(val) ? val : []);

    const userYearResult = await db.query('SELECT active_school_year_id FROM users WHERE id = $1', [userId]);
    const schoolYearId = req.schoolYearId || userYearResult.rows[0]?.active_school_year_id;
    if (!schoolYearId) {
      return res.status(400).json({ error: 'No active school year selected for restore' });
    }

    const licenseResult = await db.query(
      `SELECT 1 FROM user_school_year_licenses WHERE user_id = $1 AND school_year_id = $2 LIMIT 1`,
      [userId, schoolYearId]
    );
    if (licenseResult.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have a license for the active school year' });
    }

    const restoreOptions = {
      mergeData: req.body.mergeData === 'true',
      updateSettings: req.body.updateSettings === 'true'
    };

    client = await db.connect();
    await client.query('BEGIN');

    const restoredCounts = {
      students: 0,
      subjects: 0,
      grades: 0,
      lessons: 0,
      gradeCategoryTypes: 0,
      studentGroups: 0,
      settingsUpdated: false
    };

    const studentMap = new Map<string, string>();
    const subjectMap = new Map<string, string>();
    const lessonMap = new Map<string, string>();

    for (const student of toArray(payload.students)) {
      const studentName = student.name || student.full_name || student.student_name;
      if (!studentName) continue;

      const studentBirthday = student.birthday || student.birthdate || null;
      const studentGrade = student.grade || student.grade_level || null;

      if (restoreOptions.mergeData) {
        const existing = await client.query(
          `SELECT id FROM students
           WHERE user_id = $1 AND school_year_id = $2 AND name = $3
             AND COALESCE(birthday::text, '') = COALESCE($4::text, '')
           LIMIT 1`,
          [userId, schoolYearId, studentName, studentBirthday]
        );
        if (existing.rows.length > 0) {
          if (student.id) studentMap.set(String(student.id), existing.rows[0].id);
          continue;
        }
      }

      const inserted = await client.query(
        `INSERT INTO students (id, user_id, school_year_id, name, grade, birthday, created_at, updated_at)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::date, $7, $8)
         RETURNING id`,
        [student.id || null, userId, schoolYearId, studentName, studentGrade, studentBirthday, student.created_at || nowIso, student.updated_at || nowIso]
      );

      if (student.id) studentMap.set(String(student.id), inserted.rows[0].id);
      restoredCounts.students++;
    }

    for (const subject of toArray(payload.subjects)) {
      const subjectName = subject.name || subject.subject_name;
      if (!subjectName) continue;

      if (restoreOptions.mergeData) {
        const existing = await client.query(
          `SELECT id FROM subjects WHERE user_id = $1 AND school_year_id = $2 AND name = $3 LIMIT 1`,
          [userId, schoolYearId, subjectName]
        );
        if (existing.rows.length > 0) {
          if (subject.id) subjectMap.set(String(subject.id), existing.rows[0].id);
          continue;
        }
      }

      const inserted = await client.query(
        `INSERT INTO subjects (id, user_id, school_year_id, name, report_card_name, description, created_at, updated_at)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [subject.id || null, userId, schoolYearId, subjectName, subject.report_card_name || subjectName, subject.description || null, subject.created_at || nowIso, subject.updated_at || nowIso]
      );

      if (subject.id) subjectMap.set(String(subject.id), inserted.rows[0].id);
      restoredCounts.subjects++;
    }

    for (const category of toArray(payload.gradeCategoryTypes)) {
      if (!category?.name) continue;
      if (restoreOptions.mergeData) {
        const existing = await client.query(
          'SELECT id FROM grade_category_types WHERE name = $1 AND user_id = $2 LIMIT 1',
          [category.name, userId]
        );
        if (existing.rows.length > 0) continue;
      }

      await client.query(
        `INSERT INTO grade_category_types (user_id, name, description, is_default, is_active, color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          category.name,
          category.description || null,
          category.is_default ?? false,
          category.is_active ?? true,
          category.color || null,
          category.created_at || nowIso,
          category.updated_at || nowIso,
        ]
      );
      restoredCounts.gradeCategoryTypes++;
    }

    for (const group of toArray(payload.studentGroups)) {
      if (!group?.name) continue;
      if (restoreOptions.mergeData) {
        const existing = await client.query(
          'SELECT id FROM student_groups WHERE name = $1 AND user_id = $2 AND school_year_id = $3 LIMIT 1',
          [group.name, userId, schoolYearId]
        );
        if (existing.rows.length > 0) continue;
      }

      await client.query(
        `INSERT INTO student_groups (user_id, school_year_id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, schoolYearId, group.name, group.description || null, group.created_at || nowIso, group.updated_at || nowIso]
      );
      restoredCounts.studentGroups++;
    }

    for (const lesson of toArray(payload.lessons)) {
      const sourceSubjectId = lesson.subject_id || lesson.subjectId;
      const newSubjectId = subjectMap.get(String(sourceSubjectId)) || sourceSubjectId;
      const lessonName = lesson.name || lesson.title;
      if (!newSubjectId || !lessonName) continue;

      if (restoreOptions.mergeData) {
        const existing = await client.query(
          `SELECT id FROM lessons WHERE subject_id = $1 AND school_year_id = $2 AND name = $3 LIMIT 1`,
          [newSubjectId, schoolYearId, lessonName]
        );
        if (existing.rows.length > 0) {
          if (lesson.id) lessonMap.set(String(lesson.id), existing.rows[0].id);
          continue;
        }
      }

      const inserted = await client.query(
        `INSERT INTO lessons (id, subject_id, school_year_id, name, category_id, points, order_index, date, created_at, updated_at)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, COALESCE($6, 100), COALESCE($7, 1), $8::date, $9, $10)
         RETURNING id`,
        [
          lesson.id || null,
          newSubjectId,
          schoolYearId,
          lessonName,
          lesson.category_id || lesson.categoryId || null,
          lesson.points || lesson.maxPoints || null,
          lesson.order_index || lesson.orderIndex || null,
          lesson.date || lesson.lesson_date || null,
          lesson.created_at || nowIso,
          lesson.updated_at || nowIso,
        ]
      );

      if (lesson.id) lessonMap.set(String(lesson.id), inserted.rows[0].id);
      restoredCounts.lessons++;
    }

    for (const grade of toArray(payload.grades)) {
      const sourceStudentId = grade.student_id || grade.studentId;
      const sourceLessonId = grade.lesson_id || grade.lessonId;
      const newStudentId = studentMap.get(String(sourceStudentId)) || sourceStudentId;
      const newLessonId = lessonMap.get(String(sourceLessonId)) || sourceLessonId;
      if (!newStudentId || !newLessonId) continue;

      const lessonCheck = await client.query(
        `SELECT 1
         FROM lessons l
         JOIN subjects s ON l.subject_id = s.id
         WHERE l.id = $1 AND l.school_year_id = $2 AND s.user_id = $3 AND s.school_year_id = $2
         LIMIT 1`,
        [newLessonId, schoolYearId, userId]
      );
      if (lessonCheck.rows.length === 0) continue;

      if (restoreOptions.mergeData) {
        const existing = await client.query(
          'SELECT id FROM grades WHERE student_id = $1 AND lesson_id = $2 LIMIT 1',
          [newStudentId, newLessonId]
        );
        if (existing.rows.length > 0) continue;
      }

      await client.query(
        `INSERT INTO grades (id, student_id, lesson_id, percentage, errors, points, school_year_id, created_at, updated_at)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (student_id, lesson_id)
         DO UPDATE SET
           percentage = EXCLUDED.percentage,
           errors = EXCLUDED.errors,
           points = EXCLUDED.points,
           school_year_id = EXCLUDED.school_year_id,
           updated_at = EXCLUDED.updated_at`,
        [
          grade.id || null,
          newStudentId,
          newLessonId,
          grade.percentage ?? grade.grade_value ?? null,
          grade.errors ?? null,
          grade.points ?? grade.max_points ?? null,
          schoolYearId,
          grade.created_at || nowIso,
          grade.updated_at || nowIso,
        ]
      );
      restoredCounts.grades++;
    }

    if (restoreOptions.updateSettings && payload.schoolSettings) {
      const settings = payload.schoolSettings;
      await client.query(
        'UPDATE users SET school_name = $1, first_day_of_school = $2, grading_periods = $3, updated_at = $4 WHERE id = $5',
        [
          settings.schoolName || null,
          settings.firstDayOfSchool || null,
          settings.gradingPeriods || 6,
          nowIso,
          userId
        ]
      );
      restoredCounts.settingsUpdated = true;
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Data restored successfully',
      restored: restoredCounts,
      metadata: {
        exportedAt: backupData.exportedAt || backupData.timestamp || null,
        exportedBy: backupData.exportedBy || null,
        version: backupData.version || 'unknown',
        schoolYearId,
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

  const payload = data?.data && typeof data.data === 'object' ? data.data : data;

  // Check for required structure
  const hasValidStructure = (
    Array.isArray(payload.students) ||
    Array.isArray(payload.subjects) ||
    Array.isArray(payload.grades) ||
    Array.isArray(payload.lessons) ||
    Array.isArray(payload.gradeCategoryTypes) ||
    Array.isArray(payload.studentGroups) ||
    payload.schoolSettings
  );

  return hasValidStructure;
}

export default router;
