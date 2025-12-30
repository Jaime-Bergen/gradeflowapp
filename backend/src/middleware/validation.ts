import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.details.map((detail: Joi.ValidationErrorItem) => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
      return;
    }
    
    req.body = value;
    next();
  };
};

// Common validation schemas
export const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(100).required()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  resetPassword: Joi.object({
    email: Joi.string().email().required()
  }),

  student: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    // Keep birthday as a plain YYYY-MM-DD string to avoid timezone shifts when saving to Postgres DATE
    birthday: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional().allow(null, ''),
    groupIds: Joi.array().items(Joi.string().uuid()).optional() // Many-to-many format
  }),

  studentGroup: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).optional()
  }),

  subject: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    report_card_name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(500).optional(),
    groupIds: Joi.array().items(Joi.string().uuid()).optional(), // Many-to-many format
    weights: Joi.object().pattern(Joi.string().uuid(), Joi.number().min(0).max(1)).optional() // Weights structure
  }),

  lesson: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    categoryId: Joi.string().uuid().optional(),
    points: Joi.number().integer().min(1).max(1000).default(100)
  }),

  grade: Joi.object({
    percentage: Joi.number().min(0).max(100).optional(),
    errors: Joi.number().min(0).optional(), // Allow decimal errors (e.g., 2.5)
    points: Joi.number().integer().min(1).optional() // Keep as integer for total points
  }),

  attendanceBulk: Joi.object({
    records: Joi.array()
      .items(
        Joi.object({
          studentId: Joi.string().uuid().required(),
          // Keep as a plain YYYY-MM-DD string to avoid timezone coercion
          date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
          status: Joi.string().valid('present', 'absent', 'tardy', 'excused').required(),
          notes: Joi.string().max(500).allow('', null).optional()
        })
      )
      .min(1)
      .required()
  }),

  gradingPeriodsBulk: Joi.object({
    periods: Joi.array()
      .items(
        Joi.object({
          id: Joi.string().uuid().optional(),
          name: Joi.string().min(1).max(100).required(),
          startDate: Joi.string().pattern(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).required(),
          endDate: Joi.string().pattern(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).required(),
          orderIndex: Joi.number().integer().min(1).required()
        })
      )
      .min(1)
      .required()
  }),

  kv: Joi.object({
    key: Joi.string().min(1).max(255).required(),
    value: Joi.any().required()
  })
};