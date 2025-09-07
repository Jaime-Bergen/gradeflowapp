import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';
import { validateRequest, schemas } from '../middleware/validation';

const router = express.Router();

// Get all grades for the authenticated user
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();

    // Fetch all grades for the user
    const result = await db.query(
      `SELECT 
        g.id as grade_id, g.percentage, g.errors, g.points as grade_points,
        g.created_at, g.updated_at,
        s.id as student_id, s.name as student_name,
        sub.id as subject_id, sub.name as subject_name,
        l.id as lesson_id, l.name as lesson_name, gct.name as lesson_type, 
        l.points as lesson_points, l.order_index
       FROM grades g
       JOIN students s ON g.student_id = s.id
       JOIN lessons l ON g.lesson_id = l.id
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id
       JOIN subjects sub ON l.subject_id = sub.id
       WHERE s.user_id = $1
       ORDER BY sub.name, s.name, l.order_index`,
      [req.userId]
    );

    // Transform the data to match frontend interface
    const grades = result.rows.map(row => ({
      id: row.grade_id,
      studentId: row.student_id,
      lessonId: row.lesson_id,
      subjectId: row.subject_id,
      percentage: row.percentage,
      points: row.grade_points, // This is the earned points
      maxPoints: row.lesson_points, // This is the total possible points from the lesson
      errors: row.errors,
      date: row.created_at, // Use the actual created_at timestamp
      notes: undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    res.json(grades);
  } catch (error) {
    next(error);
  }
});

// Get grades for a specific student and subject
router.get('/student/:studentId/subject/:subjectId', async (req: AuthRequest, res, next) => {
  try {
    const { studentId, subjectId } = req.params;
    const db = getDB();
    
    // Verify student and subject belong to user
    const verifyResult = await db.query(
      `SELECT s.id as student_id, sub.id as subject_id 
       FROM students s, subjects sub
       WHERE s.id = $1 AND sub.id = $2 AND s.user_id = $3 AND sub.user_id = $3`,
      [studentId, subjectId, req.userId]
    );
    
    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student or subject not found' });
    }
    
    const result = await db.query(
      `SELECT g.*, l.name as lesson_name, gct.name as lesson_type, l.points as lesson_points, l.order_index
       FROM grades g
       JOIN lessons l ON g.lesson_id = l.id
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id
       WHERE g.student_id = $1 AND l.subject_id = $2
       ORDER BY l.order_index`,
      [studentId, subjectId]
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get all grades for a subject (all students)
router.get('/subject/:subjectId', async (req: AuthRequest, res, next) => {
  try {
    const { subjectId } = req.params;
    const db = getDB();
    
    // Verify subject belongs to user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [subjectId, req.userId]
    );
    
    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    
    const result = await db.query(
      `SELECT 
        s.id as student_id, s.name as student_name,
        l.id as lesson_id, l.name as lesson_name, gct.name as lesson_type, 
        l.points as lesson_points, l.order_index,
        g.id as grade_id, g.percentage, g.errors, g.points as grade_points
       FROM students s
       CROSS JOIN lessons l
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id
       LEFT JOIN grades g ON s.id = g.student_id AND l.id = g.lesson_id
       WHERE l.subject_id = $1 AND s.user_id = $2
       ORDER BY s.name, l.order_index`,
      [subjectId, req.userId]
    );
    
    // Group by student
    const gradesByStudent = result.rows.reduce((acc, row) => {
      if (!acc[row.student_id]) {
        acc[row.student_id] = {
          studentId: row.student_id,
          studentName: row.student_name,
          grades: []
        };
      }
      
      acc[row.student_id].grades.push({
        gradeId: row.grade_id,
        lessonId: row.lesson_id,
        lessonName: row.lesson_name,
        lessonType: row.lesson_type,
        lessonPoints: row.lesson_points,
        orderIndex: row.order_index,
        percentage: row.percentage,
        errors: row.errors,
        gradePoints: row.grade_points
      });
      
      return acc;
    }, {});
    
    res.json(Object.values(gradesByStudent));
  } catch (error) {
    next(error);
  }
});

// Set or update a grade
router.put('/student/:studentId/lesson/:lessonId', validateRequest(schemas.grade), async (req: AuthRequest, res, next) => {
  try {
    const { studentId, lessonId } = req.params;
    const { percentage, errors, points } = req.body;
    const db = getDB();
    
    // Verify student and lesson belong to user
    const verifyResult = await db.query(
      `SELECT s.id as student_id, l.id as lesson_id, l.points as lesson_points
       FROM students s, lessons l, subjects sub
       WHERE s.id = $1 AND l.id = $2 AND l.subject_id = sub.id 
       AND s.user_id = $3 AND sub.user_id = $3`,
      [studentId, lessonId, req.userId]
    );
    
    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student or lesson not found' });
    }
    
    const lessonPoints = verifyResult.rows[0].lesson_points;
    
    // Calculate missing values
    let finalPercentage = percentage;
    let finalErrors = errors;
    let finalPoints = points;
    
    if (finalPercentage !== undefined && finalPercentage !== null) {
      // Percentage provided, calculate errors (preserve decimal precision)
      finalErrors = Math.round((lessonPoints * (1 - finalPercentage / 100)) * 2) / 2; // Round to nearest 0.5
      finalPoints = lessonPoints;
    } else if (finalErrors !== undefined && finalErrors !== null && finalPoints !== undefined && finalPoints !== null) {
      // Errors and points provided, calculate percentage (round to nearest 0.5%)
      finalPercentage = Math.round(((finalPoints - finalErrors) / finalPoints) * 100 * 2) / 2;
    } else {
      return res.status(400).json({ error: 'Must provide either percentage or both errors and points' });
    }
    
    // Upsert the grade
    const result = await db.query(
      `INSERT INTO grades (student_id, lesson_id, percentage, errors, points)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, lesson_id)
       DO UPDATE SET 
         percentage = $3, 
         errors = $4, 
         points = $5,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, lessonId, finalPercentage, finalErrors, finalPoints]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete a grade
router.delete('/student/:studentId/lesson/:lessonId', async (req: AuthRequest, res, next) => {
  try {
    const { studentId, lessonId } = req.params;
    const db = getDB();
    
    // Verify student and lesson belong to user
    const verifyResult = await db.query(
      `SELECT s.id as student_id, l.id as lesson_id
       FROM students s, lessons l, subjects sub
       WHERE s.id = $1 AND l.id = $2 AND l.subject_id = sub.id 
       AND s.user_id = $3 AND sub.user_id = $3`,
      [studentId, lessonId, req.userId]
    );
    
    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student or lesson not found' });
    }
    
    const result = await db.query(
      'DELETE FROM grades WHERE student_id = $1 AND lesson_id = $2 RETURNING id',
      [studentId, lessonId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }
    
    res.json({ message: 'Grade deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get grade statistics for a subject
router.get('/subject/:subjectId/stats', async (req: AuthRequest, res, next) => {
  try {
    const { subjectId } = req.params;
    const db = getDB();
    
    // Verify subject belongs to user
    const subjectCheck = await db.query(
      'SELECT id, name FROM subjects WHERE id = $1 AND user_id = $2',
      [subjectId, req.userId]
    );
    
    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    
    // Get overall statistics
    const statsResult = await db.query(
      `SELECT 
        COUNT(DISTINCT s.id) as total_students,
        COUNT(DISTINCT l.id) as total_lessons,
        COUNT(g.id) as total_grades,
        AVG(g.percentage) as average_percentage,
        MIN(g.percentage) as min_percentage,
        MAX(g.percentage) as max_percentage
       FROM students s
       CROSS JOIN lessons l
       LEFT JOIN grades g ON s.id = g.student_id AND l.id = g.lesson_id
       WHERE l.subject_id = $1 AND s.user_id = $2`,
      [subjectId, req.userId]
    );
    
    // Get lesson type breakdown
    const lessonTypesResult = await db.query(
      `SELECT 
        gct.name as type,
        COUNT(l.id) as lesson_count,
        AVG(g.percentage) as average_percentage
       FROM lessons l
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id
       LEFT JOIN grades g ON l.id = g.lesson_id
       WHERE l.subject_id = $1
       GROUP BY gct.name
       ORDER BY gct.name`,
      [subjectId]
    );
    
    // Get student performance summary
    const studentStatsResult = await db.query(
      `SELECT 
        s.id,
        s.name,
        COUNT(g.id) as grades_entered,
        AVG(g.percentage) as average_percentage
       FROM students s
       LEFT JOIN grades g ON s.id = g.student_id
       LEFT JOIN lessons l ON g.lesson_id = l.id
       WHERE s.user_id = $1 AND (l.subject_id = $2 OR l.subject_id IS NULL)
       GROUP BY s.id, s.name
       ORDER BY s.name`,
      [req.userId, subjectId]
    );
    
    res.json({
      subject: subjectCheck.rows[0],
      overview: statsResult.rows[0],
      lessonTypes: lessonTypesResult.rows,
      studentStats: studentStatsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// Bulk update lesson points for a subject
router.patch('/subject/:subjectId/lessons/points', async (req: AuthRequest, res, next) => {
  try {
    const { subjectId } = req.params;
    const { lessonId, points } = req.body;
    const db = getDB();
    
    if (!lessonId || !points || points < 1) {
      return res.status(400).json({ error: 'Valid lessonId and points are required' });
    }
    
    // Verify lesson belongs to subject and user
    const lessonCheck = await db.query(
      `SELECT l.id FROM lessons l
       JOIN subjects s ON l.subject_id = s.id
       WHERE l.id = $1 AND s.id = $2 AND s.user_id = $3`,
      [lessonId, subjectId, req.userId]
    );
    
    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    // Update lesson points
    await db.query(
      'UPDATE lessons SET points = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [points, lessonId]
    );
    
    // Recalculate all percentages for grades on this lesson
    await db.query(
      `UPDATE grades SET 
        percentage = ROUND(((points - errors) / points::DECIMAL) * 1000) / 10,
        points = $1,
        updated_at = CURRENT_TIMESTAMP
       WHERE lesson_id = $2 AND errors IS NOT NULL`,
      [points, lessonId]
    );
    
    res.json({ message: 'Lesson points updated and grades recalculated' });
  } catch (error) {
    next(error);
  }
});

export default router;