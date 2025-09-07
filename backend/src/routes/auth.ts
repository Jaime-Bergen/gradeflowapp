import express from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { getDB } from '../database/connection';
import { validateRequest, schemas } from '../middleware/validation';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Register new user
router.post('/register', validateRequest(schemas.register), async (req, res, next): Promise<void> => {
  try {
    const { email, password, name } = req.body;
    const db = getDB();

    // Check if user already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      res.status(400).json({ error: 'User already exists with this email' });
      return;
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email, passwordHash, name]
    );

    const user = result.rows[0];

    // Generate JWT token
    const signOptions: SignOptions = { expiresIn: '7d' };
    const token = jwt.sign(
      { 
        userId: user.id,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      },
      process.env.JWT_SECRET!,
      signOptions
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Login user
router.post('/login', validateRequest(schemas.login), async (req, res, next): Promise<void> => {
  try {
    const { email, password } = req.body;
    const db = getDB();

    // Find user
    const result = await db.query(
      'SELECT id, email, name, password_hash, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];

    if (!user.is_active) {
      res.status(401).json({ error: 'Account is deactivated' });
      return;
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate JWT token
    const signOptions: SignOptions = { expiresIn: '7d' };
    const token = jwt.sign(
      { 
        userId: user.id,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      },
      process.env.JWT_SECRET!,
      signOptions
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    next(error);
  }
});

// Password reset
router.post('/reset-password', validateRequest(schemas.resetPassword), async (req, res, next): Promise<void> => {
  try {
    const { email } = req.body;
    
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const db = getDB();

    // Find user by email
    const result = await db.query(
      'SELECT id, email, name FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      // For security, don't reveal if email exists or not
      res.json({ message: 'If an account with that email exists, a new password has been sent to it.' });
      return;
    }

    const user = result.rows[0];

    // Generate a simple but random password (6-8 characters, mix of letters and numbers)
    const generateSimplePassword = (): string => {
      const length = Math.floor(Math.random() * 3) + 6; // 6-8 characters
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let password = '';
      for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const newPassword = generateSimplePassword();

    // Hash the new password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update user's password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, user.id]
    );

    // Send email with new password
    await sendResetEmail(user.email, user.name, newPassword);

    res.json({ 
      message: 'If an account with that email exists, a new password has been sent to it.' 
    });
  } catch (error) {
    console.error('Password reset error:', error);
    next(error);
  }
});

// Simple email sending function (you can replace this with a proper email service)
async function sendResetEmail(email: string, name: string, newPassword: string): Promise<void> {
  // For now, just log the password to console (in production, you'd use a real email service)
  console.log(`[PASSWORD RESET] Email: ${email}, Name: ${name}, New Password: ${newPassword}`);
  
  // If you want to integrate with a real email service, you can add that here
  // For example, using Nodemailer, SendGrid, or another service
  
  // Simulated email sending
  return Promise.resolve();
}

export default router;
