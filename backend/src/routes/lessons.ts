import express from 'express';
import { getDB } from '../database/connection';

const router = express.Router();

// Get all lessons for a subject
router.get('/subject/:subjectId', async (req, res) => {
  const { subjectId } = req.params;
  const db = getDB();
  try {
    const { rows: lessons } = await db.query(
      'SELECT * FROM lessons WHERE subject_id = $1 ORDER BY order_index ASC',
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
    const { rows } = await db.query('SELECT * FROM lessons WHERE id = $1', [lessonId]);
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
  const { name, type, maxPoints, orderIndex } = req.body;
  const db = getDB();
  try {
    const { rows } = await db.query(
      'INSERT INTO lessons (subject_id, name, type, points, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [subjectId, name, type, maxPoints, orderIndex ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add lesson' });
  }
});

// Update a lesson
router.put('/:lessonId', async (req, res) => {
  const { lessonId } = req.params;
  const { name, type, maxPoints, points, orderIndex } = req.body;
  const db = getDB();
  
  try {
    // First, get the current lesson data
    const { rows: currentRows } = await db.query('SELECT * FROM lessons WHERE id = $1', [lessonId]);
    const currentLesson = currentRows[0];
    
    if (!currentLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    // Use current values as defaults for any undefined fields
    // Accept either 'points' or 'maxPoints' for backwards compatibility
    const updatedName = name !== undefined ? name : currentLesson.name;
    const updatedType = type !== undefined ? type : currentLesson.type;
    const updatedMaxPoints = (maxPoints !== undefined ? maxPoints : points !== undefined ? points : currentLesson.points);
    const updatedOrderIndex = orderIndex !== undefined ? orderIndex : currentLesson.order_index;
    
    const { rows } = await db.query(
      'UPDATE lessons SET name = $1, type = $2, points = $3, order_index = $4 WHERE id = $5 RETURNING *',
      [updatedName, updatedType, updatedMaxPoints, updatedOrderIndex, lessonId]
    );
    
    const lesson = rows[0];
    res.json(lesson);
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
