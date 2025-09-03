import { Router, Response } from 'express';
import { getDB } from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/grade-category-types - Get all grade category types for current user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getDB().query(`
      SELECT id, name, description, is_default, is_active, sort_order, created_at, updated_at
      FROM grade_category_types 
      WHERE user_id = $1 
      ORDER BY sort_order ASC, name ASC
    `, [req.userId]);

    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching grade category types:', error);
    res.status(500).json({ error: 'Failed to fetch grade category types' });
  }
});

// GET /api/grade-category-types/active - Get only active grade category types for current user
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getDB().query(`
      SELECT id, name, description, is_default, is_active, sort_order, created_at, updated_at
      FROM grade_category_types 
      WHERE user_id = $1 AND is_active = true
      ORDER BY sort_order ASC, name ASC
    `, [req.userId]);

    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching active grade category types:', error);
    res.status(500).json({ error: 'Failed to fetch active grade category types' });
  }
});

// POST /api/grade-category-types - Create new grade category type
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, sort_order, is_active, is_default } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const db = getDB();
    
    // If setting this as default, clear other defaults first
    if (is_default) {
      await db.query(`
        UPDATE grade_category_types 
        SET is_default = false 
        WHERE user_id = $1 AND is_default = true
      `, [req.userId]);
    }

    const result = await db.query(`
      INSERT INTO grade_category_types (user_id, name, description, sort_order, is_active, is_default)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, description, is_default, is_active, sort_order, created_at, updated_at
    `, [req.userId, name.trim(), description || null, sort_order || 0, is_active !== undefined ? is_active : true, is_default || false]);

    res.status(201).json({ data: result.rows[0] });
  } catch (error: any) {
    console.error('Error creating grade category type:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505' && error.constraint === 'grade_category_types_user_id_name_key') {
      return res.status(400).json({ error: 'A category with this name already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create grade category type' });
  }
});

// PUT /api/grade-category-types/:id - Update grade category type
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, sort_order, is_active, is_default } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const db = getDB();
    
    // If setting this as default, clear other defaults first
    if (is_default) {
      await db.query(`
        UPDATE grade_category_types 
        SET is_default = false 
        WHERE user_id = $1 AND is_default = true AND id != $2
      `, [req.userId, id]);
    }

    const result = await db.query(`
      UPDATE grade_category_types 
      SET name = $1, description = $2, sort_order = $3, is_active = $4, is_default = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND user_id = $7
      RETURNING id, name, description, is_default, is_active, sort_order, created_at, updated_at
    `, [name.trim(), description || null, sort_order || 0, is_active !== undefined ? is_active : true, is_default || false, id, req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grade category type not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating grade category type:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505' && error.constraint === 'grade_category_types_user_id_name_key') {
      return res.status(400).json({ error: 'A category with this name already exists' });
    }
    
    res.status(500).json({ error: 'Failed to update grade category type' });
  }
});

// DELETE /api/grade-category-types/:id - Delete grade category type
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check if this category is being used in any lessons
    const usageCheck = await getDB().query(`
      SELECT COUNT(*) as count 
      FROM lessons l
      JOIN subjects s ON l.subject_id = s.id
      WHERE s.user_id = $1 AND l.type = (
        SELECT name FROM grade_category_types 
        WHERE id = $2 AND user_id = $1
      )
    `, [req.userId, id]);

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category that is being used by existing lessons' 
      });
    }

    const result = await getDB().query(`
      DELETE FROM grade_category_types 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [id, req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grade category type not found' });
    }

    res.json({ message: 'Grade category type deleted successfully' });
  } catch (error) {
    console.error('Error deleting grade category type:', error);
    res.status(500).json({ error: 'Failed to delete grade category type' });
  }
});

// GET /api/grade-category-types/:id/usage - Check if grade category type is in use
router.get('/:id/usage', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await getDB().query(`
      SELECT COUNT(*) as usage_count
      FROM subject_weights sw
      JOIN subjects s ON sw.subject_id = s.id
      WHERE sw.category_id = $1 AND s.user_id = $2
    `, [id, req.userId]);

    const usageCount = parseInt(result.rows[0].usage_count);
    res.json({ inUse: usageCount > 0, usageCount });
  } catch (error) {
    console.error('Error checking grade category type usage:', error);
    res.status(500).json({ error: 'Failed to check usage' });
  }
});

export default router;
