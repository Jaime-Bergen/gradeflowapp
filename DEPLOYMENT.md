# Heroku Deployment Checklist

## Pre-Deployment Checklist

### ✅ Code Cleanup (Completed)
- [x] Removed debug console.log statements from frontend
- [x] Removed debug console.log statements from backend API routes
- [x] Kept migration logs (useful for deployment monitoring)

### Required Environment Variables
Set these in Heroku Config Vars:

#### Database
```
DATABASE_URL=postgresql://username:password@host:port/database
```

#### Authentication
```
JWT_SECRET=your-super-secure-jwt-secret-here-min-32-chars
```

#### Optional
```
NODE_ENV=production
PORT=5000
```

### Heroku Configuration Files

#### Package.json Scripts (Backend)
Ensure your `backend/package.json` has:
```json
{
  "scripts": {
    "start": "node dist/server.js",
    "build": "tsc",
    "postbuild": "echo 'Build completed'",
    "heroku-postbuild": "npm run build"
  }
}
```

#### Package.json Scripts (Frontend) 
Ensure your root `package.json` has:
```json
{
  "scripts": {
    "build": "vite build",
    "start": "vite preview --port $PORT --host 0.0.0.0"
  }
}
```

### Required Files

#### Procfile (in root directory)
```
web: npm run start
api: cd backend && npm start
```

Or for a unified deployment:
```
web: cd backend && npm start
```

#### .env.example (for reference)
```
DATABASE_URL=postgresql://localhost:5432/gradeflow
JWT_SECRET=your-jwt-secret-here
NODE_ENV=development
PORT=5000
```

## Database Setup

### PostgreSQL Add-on
```bash
heroku addons:create heroku-postgresql:mini
```

### Environment Variables
```bash
heroku config:set JWT_SECRET=$(openssl rand -base64 32)
heroku config:set NODE_ENV=production
```

## Build Configuration

### TypeScript Compilation
Ensure backend builds properly:
- All TypeScript files compile without errors
- dist/ directory is generated correctly
- All dependencies are in `dependencies` (not `devDependencies`) if needed at runtime

### Frontend Build
- Vite build produces dist/ directory
- All assets are properly bundled
- Environment variables are handled correctly

## Security Considerations

### ✅ Completed
- [x] JWT secret will be environment variable
- [x] Database URL will be environment variable
- [x] No hardcoded secrets in code
- [x] Debug logs removed from production

### Additional Recommendations
- [ ] Enable CORS properly for your domain
- [ ] Set up proper error logging (consider Heroku logs or external service)
- [ ] Consider rate limiting for API endpoints
- [ ] Set up SSL/HTTPS (Heroku provides this automatically)

## Performance Optimizations

### Database
- [ ] Add database indexes where needed (already have some basic ones)
- [ ] Consider connection pooling for high traffic
- [ ] Monitor database performance

### Frontend
- [x] Vite optimizes bundles automatically
- [x] Components are properly lazy-loaded where needed
- [x] API calls are optimized

## Deployment Commands

### Initial Deployment
```bash
# From project root
heroku create your-app-name
heroku addons:create heroku-postgresql:mini
heroku config:set JWT_SECRET=$(openssl rand -base64 32)
heroku config:set NODE_ENV=production

# Deploy
git add .
git commit -m "Prepare for Heroku deployment"
git push heroku main
```

### Post-Deployment
```bash
# Check logs
heroku logs --tail

# Run database migrations (if needed)
heroku run node backend/dist/database/migrations.js
```

## Monitoring

### Heroku Logs
```bash
heroku logs --tail -a your-app-name
```

### Health Checks
- [ ] Set up basic health check endpoint
- [ ] Monitor application performance
- [ ] Set up alerts for errors

## Potential Issues & Solutions

### Common Problems
1. **Build failures**: Check that all TypeScript compiles
2. **Database connection**: Verify DATABASE_URL is set
3. **Port binding**: Use `process.env.PORT` in server
4. **Static files**: Ensure frontend build is served correctly

### Debug Commands
```bash
heroku config              # Check environment variables
heroku ps                  # Check dyno status
heroku logs --tail         # Check logs
heroku run bash            # Access dyno shell
```

## Final Checklist Before Deploy

- [ ] All environment variables configured
- [ ] Procfile exists and is correct
- [ ] Package.json scripts are correct
- [ ] TypeScript compiles without errors
- [ ] Frontend builds without errors
- [ ] Database migrations work locally
- [ ] All console.log debug statements removed
- [ ] Git repository is clean and committed

## Post-Deployment Testing

- [ ] Application loads without errors
- [ ] User authentication works
- [ ] Database operations work
- [ ] All major features function correctly
- [ ] Performance is acceptable
