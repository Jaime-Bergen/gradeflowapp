# GradeFlow Backend

A robust Node.js backend for the GradeFlow application with PostgreSQL database support, JWT authentication, and RESTful API endpoints.

## Features

- **User Authentication**: Email/password registration and login with JWT tokens
- **Data Management**: Students, subjects, lessons, and grades
- **Grade Calculations**: Automatic percentage calculations with weighted averages
- **Reports & Analytics**: Comprehensive reporting and dashboard statistics
- **Multi-user Support**: Isolated data per user account
- **Key-Value Storage**: Flexible storage for frontend application state
- **Security**: Rate limiting, CORS, input validation, and secure password hashing

## Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- npm or yarn

## Installation

1. **Clone and navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   NODE_ENV=production
   PORT=3001
   DATABASE_URL=postgresql://username:password@localhost:5432/teachergrade_db
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=7d
   CORS_ORIGIN=http://localhost:5173,https://your-frontend-domain.com
   ```

4. **Set up PostgreSQL database:**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE teachergrade_db;
   CREATE USER your_username WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE teachergrade_db TO your_username;
   \q
   ```

5. **Build the application:**
   ```bash
   npm run build
   ```

6. **Start the server:**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## Ubuntu Server Deployment

### 1. Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y
```

### 2. Configure PostgreSQL
```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE teachergrade_db;
CREATE USER teachergrade_user WITH PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE teachergrade_db TO teachergrade_user;
ALTER USER teachergrade_user CREATEDB;
\q

# Configure PostgreSQL for remote connections (if needed)
sudo nano /etc/postgresql/*/main/postgresql.conf
# Uncomment: listen_addresses = 'localhost'

sudo nano /etc/postgresql/*/main/pg_hba.conf
# Add: local   all   teachergrade_user   md5

sudo systemctl restart postgresql
```

### 3. Deploy Application
```bash
# Create app directory
sudo mkdir -p /opt/teachergrade-backend
cd /opt/teachergrade-backend

# Copy your backend files here
# You can use scp, git clone, or other methods

# Install dependencies and build
npm install --production
npm run build

# Set permissions
sudo chown -R $USER:$USER /opt/teachergrade-backend
```

### 4. Create Systemd Service
```bash
sudo nano /etc/systemd/system/teachergrade-backend.service
```

Add the following content:
```ini
[Unit]
Description=GradeFlow Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/teachergrade-backend
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/teachergrade-backend/.env

# Security
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/teachergrade-backend

[Install]
WantedBy=multi-user.target
```

### 5. Configure Firewall
```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow the application port
sudo ufw allow 3001

# Check status
sudo ufw status
```

### 6. Start and Enable Service
```bash
# Reload systemd
sudo systemctl daemon-reload

# Start the service
sudo systemctl start teachergrade-backend

# Enable on boot
sudo systemctl enable teachergrade-backend

# Check status
sudo systemctl status teachergrade-backend

# View logs
sudo journalctl -u teachergrade-backend -f
```

### 7. Nginx Reverse Proxy (Optional)
```bash
sudo apt install nginx -y

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/teachergrade-backend
```

Add configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/teachergrade-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo ufw allow 'Nginx Full'
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get current user profile
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Students
- `GET /api/students` - Get all students
- `POST /api/students` - Create student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student
- `GET /api/students/groups` - Get student groups
- `POST /api/students/groups` - Create student group

### Subjects
- `GET /api/subjects` - Get all subjects
- `POST /api/subjects` - Create subject
- `PUT /api/subjects/:id` - Update subject
- `DELETE /api/subjects/:id` - Delete subject
- `GET /api/subjects/:id/lessons` - Get lessons for subject
- `POST /api/subjects/:id/lessons` - Add lesson to subject
- `POST /api/subjects/:id/lessons/bulk` - Add multiple lessons

### Grades
- `GET /api/grades/subject/:subjectId` - Get all grades for subject
- `PUT /api/grades/student/:studentId/lesson/:lessonId` - Set/update grade
- `DELETE /api/grades/student/:studentId/lesson/:lessonId` - Delete grade
- `GET /api/grades/subject/:subjectId/stats` - Get grade statistics

### Reports
- `GET /api/reports/student/:studentId` - Get student report
- `GET /api/reports/group/:groupId` - Get group report
- `GET /api/reports/dashboard` - Get dashboard statistics

### Key-Value Storage
- `GET /api/kv/keys` - Get all keys
- `GET /api/kv/:key` - Get value by key
- `PUT /api/kv/:key` - Set value by key
- `DELETE /api/kv/:key` - Delete key

## Database Schema

The application uses PostgreSQL with the following main tables:

- `users` - User accounts with authentication
- `student_groups` - Student group/class organization
- `students` - Student records
- `subjects` - Subject/course definitions
- `lessons` - Individual lessons within subjects
- `grades` - Grade records linking students to lessons
- `kv_store` - Key-value storage for application state

## Security Features

- **Password Hashing**: bcrypt with 12 salt rounds
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents abuse with configurable limits
- **Input Validation**: Joi schema validation for all inputs
- **CORS Protection**: Configurable origin restrictions
- **SQL Injection Prevention**: Parameterized queries
- **Environment Variables**: Sensitive data in environment files

## Monitoring and Maintenance

### View Logs
```bash
# Application logs
sudo journalctl -u teachergrade-backend -f

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*-main.log

# Nginx logs (if using)
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Database Maintenance
```bash
# Connect to database
sudo -u postgres psql teachergrade_db

# View table sizes
SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size 
FROM pg_tables WHERE schemaname = 'public';

# Create backup
sudo -u postgres pg_dump teachergrade_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### SSL/HTTPS Setup
For production, use Let's Encrypt with Certbot:
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check PostgreSQL service: `sudo systemctl status postgresql`
   - Verify credentials in `.env` file
   - Check database exists: `sudo -u postgres psql -l`

2. **Port Already in Use**
   - Check what's using the port: `sudo lsof -i :3001`
   - Kill the process: `sudo kill -9 <PID>`

3. **Permission Errors**
   - Check file permissions: `ls -la /opt/teachergrade-backend`
   - Fix ownership: `sudo chown -R ubuntu:ubuntu /opt/teachergrade-backend`

4. **Service Won't Start**
   - Check logs: `sudo journalctl -u teachergrade-backend -f`
   - Verify environment file: `cat /opt/teachergrade-backend/.env`
   - Test manually: `cd /opt/teachergrade-backend && node dist/server.js`

For support or questions, check the application logs and ensure all environment variables are properly configured.