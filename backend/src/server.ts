import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './database/connection';
import { runMigrations } from './database/migrations';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import studentRoutes from './routes/students';
import subjectRoutes from './routes/subjects';
import lessonsRoutes from './routes/lessons';
import gradeRoutes from './routes/grades';
import gradeCategoryTypesRoutes from './routes/gradeCategoryTypes';
import reportRoutes from './routes/reports';
import restoreRoutes from './routes/restore';
import metadataRoutes from './routes/metadata';
import backupRoutes from './routes/backups';
import { errorHandler } from './middleware/errorHandler';
import { authenticateToken } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware - configure for static file serving
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for easier static file serving
  crossOriginOpenerPolicy: false, // Disable COOP to avoid HTTPS issues
}));

// Ensure consistent origin-keyed agent cluster across all pages
app.use((req, res, next) => {
  res.setHeader('Origin-Agent-Cluster', '?1');
  next();
});

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Trust proxy for Heroku (more specific configuration)
app.set('trust proxy', 1); // Trust first proxy (Heroku)

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/students', authenticateToken, studentRoutes);
app.use('/api/subjects', authenticateToken, subjectRoutes);
app.use('/api/grades', authenticateToken, gradeRoutes);
app.use('/api/grade-category-types', authenticateToken, gradeCategoryTypesRoutes);
app.use('/api/reports', authenticateToken, reportRoutes);
app.use('/api/lessons', authenticateToken, lessonsRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api', restoreRoutes); // Restore routes (includes authentication)

// Serve static files from the frontend build
const frontendDistPath = path.join(__dirname, '../../dist');

app.use(express.static(frontendDistPath));

// Handle client-side routing - serve index.html for all non-API routes
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Catch-all handler for client-side routing (avoid using '*' pattern)
app.use((req, res, next) => {
  // Skip API routes and health check
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return next();
  }
  
  // For all other routes, serve the React app
  if (req.method === 'GET') {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  } else {
    next();
  }
});

// Error handling middleware
app.use(errorHandler);

async function startServer() {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Database connected successfully');
    
    // Run migrations
    await runMigrations();
    console.log('✅ Database migrations completed');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

startServer();