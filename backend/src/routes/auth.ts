import express from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
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

    // Update last login timestamp
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

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

// Email sending function using Nodemailer
async function sendResetEmail(email: string, name: string, newPassword: string): Promise<void> {
  try {
    // Create transporter using environment variables
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Email content
    const mailOptions = {
      from: `"${process.env.FROM_NAME || 'GradeFlow'}" <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: 'Password Reset - GradeFlow',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset - GradeFlow</h2>
          <p>Hello ${name},</p>
          <p>Your password has been reset as requested. Here is your new temporary password:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong style="font-size: 18px; color: #2563eb;">${newPassword}</strong>
          </div>
          <p><strong>Important:</strong> Please log in with this temporary password and change it to something you'll remember.</p>
          <p>If you didn't request this password reset, please contact support immediately.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            This email was sent from GradeFlow. Please do not reply to this email.
          </p>
        </div>
      `,
      text: `
        Password Reset - GradeFlow
        
        Hello ${name},
        
        Your password has been reset as requested. Here is your new temporary password:
        
        ${newPassword}
        
        Important: Please log in with this temporary password and change it to something you'll remember.
        
        If you didn't request this password reset, please contact support immediately.
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log(`[PASSWORD RESET] Email sent to ${email}. Message ID: ${info.messageId}`);
    
  } catch (error) {
    console.error(`[PASSWORD RESET ERROR] Failed to send email to ${email}:`, error);
    // Don't throw the error - we don't want to reveal email sending failures to the user
    // Just log it for debugging purposes
  }
}

export default router;
