import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all lessons for a subject
router.get('/subject/:subjectId', async (req: AuthRequest, res) => {
  const { subjectId } = req.params;
  const userId = req.userId;
  const db = getDB();
  try {
    // First verify that the subject belongs to the authenticated user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [subjectId, userId]
    );
    
    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const { rows: lessons } = await db.query(
      'SELECT l.*, gct.name as type, gct.color as type_color FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id AND gct.user_id = $2 WHERE l.subject_id = $1 ORDER BY l.order_index ASC',
      [subjectId, userId]
    );
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Get a single lesson by id
router.get('/:lessonId', async (req: AuthRequest, res) => {
  const { lessonId } = req.params;
  const userId = req.userId;
  const db = getDB();
  try {
    const { rows } = await db.query(
      `SELECT l.*, gct.name as type, gct.color as type_color 
       FROM lessons l 
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id AND gct.user_id = $2
       LEFT JOIN subjects s ON l.subject_id = s.id
       WHERE l.id = $1 AND s.user_id = $2`, 
      [lessonId, userId]
    );
    const lesson = rows[0];
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Add a lesson to a subject
router.post('/subject/:subjectId', async (req: AuthRequest, res) => {
  const { subjectId } = req.params;
  const { name, categoryId, maxPoints, orderIndex } = req.body;
  const userId = req.userId;
  const db = getDB();
  try {
    // First verify that the subject belongs to the authenticated user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [subjectId, userId]
    );
    
    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const { rows } = await db.query(
      'INSERT INTO lessons (subject_id, name, category_id, points, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [subjectId, name, categoryId, maxPoints, orderIndex ?? 0]
    );
    
    // Fetch the lesson with category name for response
    const { rows: lessonRows } = await db.query(
      'SELECT l.*, gct.name as type, gct.color as type_color FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.id = $1',
      [rows[0].id]
    );
    
    res.status(201).json(lessonRows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add lesson' });
  }
});

// Update a lesson
router.put('/:lessonId', async (req: AuthRequest, res) => {
  const { lessonId } = req.params;
  const { name, categoryId, maxPoints, points, orderIndex } = req.body;
  const userId = req.userId;
  const db = getDB();
  
  try {
    // First, get the current lesson data and verify user access
    const { rows: currentRows } = await db.query(
      `SELECT l.*, gct.name as type, gct.color as type_color 
       FROM lessons l 
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id AND gct.user_id = $2
       LEFT JOIN subjects s ON l.subject_id = s.id
       WHERE l.id = $1 AND s.user_id = $2`,
      [lessonId, userId]
    );
    const currentLesson = currentRows[0];
    
    if (!currentLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    // Use current values as defaults for any undefined fields
    const updatedName = name !== undefined ? name : currentLesson.name;
    const updatedCategoryId = categoryId !== undefined ? categoryId : currentLesson.category_id;
    
    // Accept either 'points' or 'maxPoints' for backwards compatibility
    const updatedMaxPoints = (maxPoints !== undefined ? maxPoints : points !== undefined ? points : currentLesson.points);
    const updatedOrderIndex = orderIndex !== undefined ? orderIndex : currentLesson.order_index;
    
    const { rows } = await db.query(
      'UPDATE lessons SET name = $1, category_id = $2, points = $3, order_index = $4 WHERE id = $5 RETURNING *',
      [updatedName, updatedCategoryId, updatedMaxPoints, updatedOrderIndex, lessonId]
    );
    
    // Fetch the updated lesson with category name for response
    const { rows: lessonRows } = await db.query(
      'SELECT l.*, gct.name as type, gct.color as type_color FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.id = $1',
      [lessonId]
    );
    
    res.json(lessonRows[0]);
  } catch (err) {
    console.error('Error updating lesson:', err);
    res.status(500).json({ error: 'Failed to update lesson', details: err.message });
  }
});

// Delete a lesson
router.delete('/:lessonId', async (req: AuthRequest, res) => {
  const { lessonId } = req.params;
  const userId = req.userId;
  const db = getDB();
  try {
    // First verify that the lesson belongs to a subject owned by the authenticated user
    const { rows } = await db.query(
      `SELECT l.id FROM lessons l 
       JOIN subjects s ON l.subject_id = s.id 
       WHERE l.id = $1 AND s.user_id = $2`,
      [lessonId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    await db.query('DELETE FROM lessons WHERE id = $1', [lessonId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

export default router;
