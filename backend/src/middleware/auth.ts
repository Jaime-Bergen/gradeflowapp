import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../database/connection';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  schoolYearId?: string;
  schoolYearOverride?: boolean;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.userId = decoded.userId;
    req.user = decoded.user;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }
};

export const resolveSchoolYearContext = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized: missing user context' });
      return;
    }

    const db = getDB();
    const requestedSchoolYearId = String(req.headers['x-school-year-id'] || req.query.schoolYearId || '').trim() || null;

    const userResult = await db.query(
      `SELECT active_school_year_id FROM users WHERE id = $1`,
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const licensedYearsResult = await db.query(
      `SELECT usyl.school_year_id
       FROM user_school_year_licenses usyl
       JOIN school_years sy ON sy.id = usyl.school_year_id
       WHERE usyl.user_id = $1
       ORDER BY sy.start_date DESC`,
      [req.userId]
    );

    const licensedYearIds = licensedYearsResult.rows.map((row: any) => row.school_year_id);
    if (licensedYearIds.length === 0) {
      res.status(403).json({ error: 'No licensed school years available for this user' });
      return;
    }

    let resolvedSchoolYearId = userResult.rows[0].active_school_year_id as string | null;

    if (requestedSchoolYearId) {
      if (!licensedYearIds.includes(requestedSchoolYearId)) {
        res.status(403).json({ error: 'Requested school year is not licensed for this user' });
        return;
      }
      resolvedSchoolYearId = requestedSchoolYearId;
    } else if (!resolvedSchoolYearId || !licensedYearIds.includes(resolvedSchoolYearId)) {
      resolvedSchoolYearId = licensedYearIds[0];
    }

    req.schoolYearId = resolvedSchoolYearId;
    req.schoolYearOverride = !!requestedSchoolYearId && requestedSchoolYearId !== userResult.rows[0].active_school_year_id;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve school year context' });
  }
};