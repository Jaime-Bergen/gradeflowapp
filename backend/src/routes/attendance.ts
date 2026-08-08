import express from 'express'
import { getDB } from '../database/connection'
import { AuthRequest } from '../middleware/auth'
import { validateRequest, schemas } from '../middleware/validation'

const router = express.Router()

// Get attendance for a specific date or range
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB()
    const { date, startDate, endDate } = req.query
    const schoolYearId = req.schoolYearId
    const params: any[] = [req.userId, schoolYearId]

    let query = `
      SELECT 
        ar.id,
        ar.student_id AS "studentId",
        ar.user_id AS "userId",
        ar.date,
        ar.status,
        ar.notes,
        ar.created_at AS "created_at",
        ar.updated_at AS "updated_at",
        s.name as student_name
      FROM attendance_records ar
      JOIN students s ON ar.student_id = s.id
      WHERE ar.user_id = $1 AND ar.school_year_id = $2
    `

    if (date) {
      params.push(date)
      query += ` AND ar.date = $${params.length}`
    } else if (startDate && endDate) {
      params.push(startDate, endDate)
      query += ` AND ar.date BETWEEN $${params.length - 1} AND $${params.length}`
    }

    query += ' ORDER BY ar.date DESC, s.name ASC'

    const result = await db.query(query, params)
    res.json(result.rows)
  } catch (error) {
    next(error)
  }
})

// Get recent attendance for a single student
router.get('/student/:studentId', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB()
    const { studentId } = req.params
    const { limit = '50' } = req.query
    const schoolYearId = req.schoolYearId

    const result = await db.query(
      `SELECT 
         ar.id,
         ar.student_id AS "studentId",
         ar.user_id AS "userId",
         ar.date,
         ar.status,
         ar.notes,
         ar.created_at AS "created_at",
         ar.updated_at AS "updated_at",
         s.name as student_name
       FROM attendance_records ar
       JOIN students s ON ar.student_id = s.id
       WHERE ar.user_id = $1 AND ar.student_id = $2 AND ar.school_year_id = $4
       ORDER BY ar.date DESC
       LIMIT $3`,
      [req.userId, studentId, parseInt(limit as string, 10), schoolYearId]
    )

    res.json(result.rows)
  } catch (error) {
    next(error)
  }
})

// Upsert attendance records in bulk for a given day/range
router.post('/bulk', validateRequest(schemas.attendanceBulk), async (req: AuthRequest, res, next) => {
  try {
    const db = getDB()
    const { records } = req.body as { records: Array<{ studentId: string; date: string; status: string; notes?: string }> }
    const schoolYearId = req.schoolYearId

    await db.query('BEGIN')
    try {
      for (const record of records) {
        await db.query(
          `INSERT INTO attendance_records (user_id, student_id, date, status, notes, school_year_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id, student_id, date)
           DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, school_year_id = EXCLUDED.school_year_id, updated_at = CURRENT_TIMESTAMP`,
          [req.userId, record.studentId, record.date, record.status, record.notes ?? null, schoolYearId]
        )
      }
      await db.query('COMMIT')
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }

    res.status(201).json({ success: true, count: records.length })
  } catch (error) {
    next(error)
  }
})

export default router
