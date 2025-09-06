import express from 'express';
import { getDB } from '../database/connection';

const router = express.Router();

// Get all lessons for a subject
router.get('/subject/:subjectId', async (req, res) => {
  const { subjectId } = req.params;
  const db = getDB();
  try {
    const { rows: lessons } = await db.query(
      'SELECT l.*, gct.name as type FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.subject_id = $1 ORDER BY l.order_index ASC',
      [subjectId]
    );
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Get a single lesson by id
router.get('/:lessonId', async (req, res) => {
  const { lessonId } = req.params;
  const db = getDB();
  try {
    const { rows } = await db.query(
      'SELECT l.*, gct.name as type FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.id = $1', 
      [lessonId]
    );
    const lesson = rows[0];
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Add a lesson to a subject
router.post('/subject/:subjectId', async (req, res) => {
  const { subjectId } = req.params;
  const { name, type, categoryId, maxPoints, orderIndex } = req.body;
  const db = getDB();
  try {
    // Support both new categoryId and legacy type for backwards compatibility
    let finalCategoryId = categoryId;
    
    if (!finalCategoryId && type) {
      // Look up category by type name for backwards compatibility
      const { rows: categoryRows } = await db.query(
        `SELECT gct.id FROM grade_category_types gct 
         JOIN subjects s ON s.user_id = gct.user_id 
         WHERE s.id = $1 AND LOWER(gct.name) = LOWER($2) LIMIT 1`,
        [subjectId, type]
      );
      if (categoryRows.length > 0) {
        finalCategoryId = categoryRows[0].id;
      }
    }
    
    const { rows } = await db.query(
      'INSERT INTO lessons (subject_id, name, category_id, points, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [subjectId, name, finalCategoryId, maxPoints, orderIndex ?? 0]
    );
    
    // Fetch the lesson with category name for response
    const { rows: lessonRows } = await db.query(
      'SELECT l.*, gct.name as type FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.id = $1',
      [rows[0].id]
    );
    
    res.status(201).json(lessonRows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add lesson' });
  }
});

// Update a lesson
router.put('/:lessonId', async (req, res) => {
  const { lessonId } = req.params;
  const { name, type, categoryId, maxPoints, points, orderIndex } = req.body;
  const db = getDB();
  
  try {
    // First, get the current lesson data
    const { rows: currentRows } = await db.query(
      'SELECT l.*, gct.name as type FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.id = $1',
      [lessonId]
    );
    const currentLesson = currentRows[0];
    
    if (!currentLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    // Use current values as defaults for any undefined fields
    const updatedName = name !== undefined ? name : currentLesson.name;
    
    // Handle category ID - support both new categoryId and legacy type
    let updatedCategoryId = currentLesson.category_id;
    if (categoryId !== undefined) {
      updatedCategoryId = categoryId;
    } else if (type !== undefined && type !== currentLesson.type) {
      // Look up category by type name for backwards compatibility
      const { rows: categoryRows } = await db.query(
        `SELECT gct.id FROM grade_category_types gct 
         JOIN subjects s ON s.user_id = gct.user_id 
         JOIN lessons l ON l.subject_id = s.id
         WHERE l.id = $1 AND LOWER(gct.name) = LOWER($2) LIMIT 1`,
        [lessonId, type]
      );
      if (categoryRows.length > 0) {
        updatedCategoryId = categoryRows[0].id;
      }
    }
    
    // Accept either 'points' or 'maxPoints' for backwards compatibility
    const updatedMaxPoints = (maxPoints !== undefined ? maxPoints : points !== undefined ? points : currentLesson.points);
    const updatedOrderIndex = orderIndex !== undefined ? orderIndex : currentLesson.order_index;
    
    const { rows } = await db.query(
      'UPDATE lessons SET name = $1, category_id = $2, points = $3, order_index = $4 WHERE id = $5 RETURNING *',
      [updatedName, updatedCategoryId, updatedMaxPoints, updatedOrderIndex, lessonId]
    );
    
    // Fetch the updated lesson with category name for response
    const { rows: lessonRows } = await db.query(
      'SELECT l.*, gct.name as type FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.id = $1',
      [lessonId]
    );
    
    res.json(lessonRows[0]);
  } catch (err) {
    console.error('Error updating lesson:', err);
    res.status(500).json({ error: 'Failed to update lesson', details: err.message });
  }
});

// Delete a lesson
router.delete('/:lessonId', async (req, res) => {
  const { lessonId } = req.params;
  const db = getDB();
  try {
    await db.query('DELETE FROM lessons WHERE id = $1', [lessonId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

export default router;
