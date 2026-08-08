import { getDB, connectDB } from './connection';

export const runMigrations = async (): Promise<void> => {
  const db = getDB();
  
  try {
    // Create tables in order of dependencies
    await createUsersTable(db);
    await createSchoolYearsTable(db);
    await createUserSchoolYearLicensesTable(db);
    await createStudentGroupsTable(db);
    await createStudentsTable(db);
    await createAttendanceRecordsTable(db);
    await createGradeCategoryTypesTable(db);
    await addIsActiveToGradeCategoryTypes(db);
    await createSubjectsTable(db);
    await addReportCardNameToSubjects(db);
    await addSchoolSettingsToUsers(db);
    await addGradingModeToUsers(db);
    await addActiveSchoolYearToUsers(db);
    await createLessonsTable(db);
    await addDateToLessons(db);
    await createGradingPeriodMarkersTable(db);
    await createGradesTable(db);
    await addDateToGrades(db);
    await createGradingPeriodsTable(db);
    await createStudentSubjectsTable(db);
    await createSubjectWeightsTable(db);
    await createUserMetadataTable(db);
    await createUserBackupsTable(db);
    await createTeachersTable(db);
    await createTeacherGroupLinksTable(db);
    
    // Run essential data migrations only
    await createSubjectGroupsJunctionTable(db);
    await createStudentGroupLinksJunctionTable(db);
    await removeLessonTypeConstraint(db);
    await removeLegacyWeightColumns(db);
    await updateGradesErrorsColumnType(db);
    await addColorToGradeCategoryTypes(db);
    await seedDefaultGradeCategoryTypes(db);
    await addUniqueConstraintToStudentGroups(db);
    await seedDefaultStudentGroups(db);
    await addCategoryIdToLessons(db);
    await populateUserMetadata(db);
    await addBirthdayToStudents(db);
    await coerceBirthdayToDate(db);
    await dropLessonTypeColumn(db);
    await addAutoEnrollmentSetting(db);
    await seedDefaultSchoolYears(db);
    await seedInitialUserSchoolYearLicenses(db);
    await addSchoolYearScopingToTables(db);
    await createRolloverScopesTable(db);
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
};

const createUsersTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT true,
      email_verified BOOLEAN DEFAULT false,
      reset_token VARCHAR(255),
      reset_token_expires TIMESTAMP,
      last_login_at TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
  `);
  console.log('✅ Users table created/verified');
};

const createStudentGroupsTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS student_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );
    
    CREATE INDEX IF NOT EXISTS idx_student_groups_user_id ON student_groups(user_id);
  `);
  console.log('✅ Student groups table created/verified');
};

const createStudentsTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS students (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      grade VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
  `);
  
  // Drop old columns if they exist (for existing installations)
  try {
    await db.query(`
      ALTER TABLE students DROP COLUMN IF EXISTS student_group_id;
      DROP INDEX IF EXISTS idx_students_group_id;
    `);
  } catch (error) {
    // Ignore errors - columns might not exist
  }
  
  console.log('✅ Students table created/verified');
};

const createAttendanceRecordsTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      status VARCHAR(20) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, student_id, date),
      CONSTRAINT attendance_status_check CHECK (status IN ('present', 'absent', 'tardy', 'excused'))
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance_records(student_id);
  `);

  console.log('✅ Attendance records table created/verified');
};

const createGradeCategoryTypesTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS grade_category_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );
    
    CREATE INDEX IF NOT EXISTS idx_grade_category_types_user_id ON grade_category_types(user_id);
    CREATE INDEX IF NOT EXISTS idx_grade_category_types_created_at ON grade_category_types(user_id, created_at);
  `);
  
  console.log('✅ Grade category types table created/verified');
};

const addIsActiveToGradeCategoryTypes = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE grade_category_types 
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);
    console.log('✅ Added is_active column to grade_category_types table');
  } catch (error) {
    console.error('Error adding is_active column:', error);
    // Don't throw - this might fail if column already exists, which is okay
  }
};

const createSubjectsTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS subjects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_subjects_user_id ON subjects(user_id);
  `);
  console.log('✅ Subjects table created/verified');
};

const addReportCardNameToSubjects = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE subjects 
      ADD COLUMN IF NOT EXISTS report_card_name VARCHAR(255);
    `);
    console.log('✅ Added report_card_name column to subjects table');
  } catch (error) {
    console.error('Error adding report_card_name column:', error);
    // Don't throw - this might fail if column already exists, which is okay
  }
};

const createLessonsTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      points INTEGER DEFAULT 100,
      order_index INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_lessons_subject_id ON lessons(subject_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_order ON lessons(subject_id, order_index);
  `);
  console.log('✅ Lessons table created/verified');
};

const addDateToLessons = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE lessons
      ADD COLUMN IF NOT EXISTS date DATE;

      UPDATE lessons
      SET date = COALESCE(date, created_at::date, updated_at::date)
      WHERE date IS NULL;

      CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(date);
    `);
    console.log('✅ Added date column to lessons (with backfill)');
  } catch (error) {
    console.error('Error adding date column to lessons:', error);
  }
};

const createGradingPeriodMarkersTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS grading_period_markers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL DEFAULT 'Grading Period End',
      order_index INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_grading_period_markers_subject_id ON grading_period_markers(subject_id);
    CREATE INDEX IF NOT EXISTS idx_grading_period_markers_order ON grading_period_markers(subject_id, order_index);
  `);
  console.log('✅ Grading period markers table created/verified');
};

const removeLessonTypeConstraint = async (db: any) => {
  try {
    // Drop the constraint that limits lesson types to hardcoded values
    await db.query(`
      ALTER TABLE lessons 
      DROP CONSTRAINT IF EXISTS lessons_type_check;
    `);
    console.log('✅ Removed restrictive lesson type constraint');
  } catch (error) {
    console.error('Error removing lesson type constraint:', error);
    // Don't throw - this might fail if constraint doesn't exist, which is okay
  }
};

const removeLegacyWeightColumns = async (db: any) => {
  try {
    // Remove the hardcoded weight columns from subjects table
    // These are replaced by the dynamic grade category system
    await db.query(`
      ALTER TABLE subjects 
      DROP COLUMN IF EXISTS lesson_weight,
      DROP COLUMN IF EXISTS review_weight,
      DROP COLUMN IF EXISTS test_weight,
      DROP COLUMN IF EXISTS quiz_weight,
      DROP COLUMN IF EXISTS project_weight,
      DROP COLUMN IF EXISTS participation_weight;
    `);
    console.log('✅ Removed legacy weight columns from subjects table');
  } catch (error) {
    console.error('Error removing legacy weight columns:', error);
    // Don't throw - some columns might not exist, which is okay
  }
};

const createGradesTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS grades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      percentage DECIMAL(5,2),
      errors INTEGER,
      points INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, lesson_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_grades_student_id ON grades(student_id);
    CREATE INDEX IF NOT EXISTS idx_grades_lesson_id ON grades(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_grades_student_lesson ON grades(student_id, lesson_id);
  `);
  console.log('✅ Grades table created/verified');
};

const addDateToGrades = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE grades
      ADD COLUMN IF NOT EXISTS date DATE;

      UPDATE grades
      SET date = COALESCE(date, created_at::date, updated_at::date)
      WHERE date IS NULL;

      CREATE INDEX IF NOT EXISTS idx_grades_date ON grades(date);
    `);
    console.log('✅ Added date column to grades (with backfill)');
  } catch (error) {
    console.error('Error adding date column to grades:', error);
  }
};

const createGradingPeriodsTable = async (db: any) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS grading_periods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, order_index),
        UNIQUE(user_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_grading_periods_user ON grading_periods(user_id, order_index);
    `);
    console.log('✅ Grading periods table created/verified');
  } catch (error) {
    console.error('Error creating grading periods table:', error);
  }
};

const createStudentSubjectsTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS student_subjects (
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      PRIMARY KEY (student_id, subject_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_student_subjects_student_id ON student_subjects(student_id);
    CREATE INDEX IF NOT EXISTS idx_student_subjects_subject_id ON student_subjects(subject_id);
  `);
  console.log('✅ Student subjects junction table created/verified');
};

const createSubjectWeightsTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS subject_weights (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES grade_category_types(id) ON DELETE CASCADE,
      weight DECIMAL(5,2) NOT NULL DEFAULT 0.0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(subject_id, category_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_subject_weights_subject_id ON subject_weights(subject_id);
    CREATE INDEX IF NOT EXISTS idx_subject_weights_category_id ON subject_weights(category_id);
  `);
  console.log('✅ Subject weights table created/verified');
};

const addGroupNamesColumnToStudents = async (db: any) => {
  try {
    // Add the new group_names column if it doesn't exist
    await db.query(`
      ALTER TABLE students 
      ADD COLUMN IF NOT EXISTS group_names TEXT;
    `);
    
    // Try to migrate existing data from student_group_id to group_names (only if the column exists)
    try {
      const result = await db.query(`
        UPDATE students 
        SET group_names = sg.name 
        FROM student_groups sg 
        WHERE students.student_group_id = sg.id 
        AND students.group_names IS NULL;
      `);
    } catch (migrationError) {
      // Ignore error - student_group_id column might not exist anymore
      console.log('ℹ️  Skipped migrating from student_group_id (column may not exist)');
    }
    
    console.log('✅ Added group_names column to students table');
  } catch (error) {
    console.error('Error adding group_names column:', error);
    // Don't throw - this might fail if column already exists, which is okay
  }
};

const addGroupNamesColumnToSubjects = async (db: any) => {
  try {
    // Add the new group_names column if it doesn't exist
    await db.query(`
      ALTER TABLE subjects 
      ADD COLUMN IF NOT EXISTS group_names TEXT;
    `);
    
    // Try to migrate existing data from student_group_id to group_names (only if the column exists)
    try {
      const result = await db.query(`
        UPDATE subjects 
        SET group_names = sg.name 
        FROM student_groups sg 
        WHERE subjects.student_group_id = sg.id 
        AND subjects.group_names IS NULL;
      `);
    } catch (migrationError) {
      // Ignore error - student_group_id column might not exist anymore
      console.log('ℹ️  Skipped migrating from subjects.student_group_id (column may not exist)');
    }
    
    console.log('✅ Added group_names column to subjects table');
  } catch (error) {
    console.error('Error adding group_names column:', error);
    // Don't throw - this might fail if column already exists, which is okay
  }
};

const removeUserIdFromGrades = async (db: any) => {
  try {
    // Check if user_id column exists first
    const checkColumn = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'grades' AND column_name = 'user_id';
    `);
    
    if (checkColumn.rows.length > 0) {
      // Drop the user_id column and its index
      await db.query(`
        DROP INDEX IF EXISTS idx_grades_user_id;
        ALTER TABLE grades DROP COLUMN IF EXISTS user_id;
      `);
      console.log('✅ Removed user_id column from grades table');
    } else {
      console.log('✅ user_id column does not exist in grades table (already clean)');
    }
  } catch (error) {
    console.error('Error removing user_id column:', error);
    // Don't throw - this might fail if column doesn't exist, which is okay
  }
};

const createSubjectGroupsJunctionTable = async (db: any) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS subject_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        student_group_id UUID NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject_id, student_group_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_subject_groups_subject_id ON subject_groups(subject_id);
      CREATE INDEX IF NOT EXISTS idx_subject_groups_student_group_id ON subject_groups(student_group_id);
    `);
    console.log('✅ Subject groups junction table created/verified');
  } catch (error) {
    console.error('Error creating subject groups junction table:', error);
    throw error;
  }
};

const migrateSubjectGroupData = async (db: any) => {
  try {
    // Migrate data from group_names column to junction table
    const subjects = await db.query(`
      SELECT id, user_id, group_names 
      FROM subjects 
      WHERE group_names IS NOT NULL AND group_names != ''
    `);
    
    for (const subject of subjects.rows) {
      if (subject.group_names) {
        const groupNames = subject.group_names.split(',').map((name: string) => name.trim());
        
        for (const groupName of groupNames) {
          // Find or create the student group
          let groupResult = await db.query(
            'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
            [subject.user_id, groupName]
          );
          
          if (groupResult.rows.length === 0) {
            // Create new group
            groupResult = await db.query(
              'INSERT INTO student_groups (user_id, name) VALUES ($1, $2) RETURNING id',
              [subject.user_id, groupName]
            );
          }
          
          // Create subject-group association
          await db.query(
            `INSERT INTO subject_groups (subject_id, student_group_id) VALUES ($1, $2) 
             ON CONFLICT (subject_id, student_group_id) DO NOTHING`,
            [subject.id, groupResult.rows[0].id]
          );
        }
      }
    }
    
    console.log('✅ Migrated subject group data to junction table');
  } catch (error) {
    console.error('Error migrating subject group data:', error);
    throw error;
  }
};

const removeOldSubjectGroupColumns = async (db: any) => {
  try {
    // Remove the old columns
    await db.query(`
      ALTER TABLE subjects DROP COLUMN IF EXISTS student_group_id;
      ALTER TABLE subjects DROP COLUMN IF EXISTS group_names;
    `);
    console.log('✅ Removed old subject group columns');
  } catch (error) {
    console.error('Error removing old subject group columns:', error);
    // Don't throw - these might already be removed
  }
};

const createStudentGroupLinksJunctionTable = async (db: any) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS student_group_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        student_group_id UUID NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, student_group_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_student_group_links_student_id ON student_group_links(student_id);
      CREATE INDEX IF NOT EXISTS idx_student_group_links_group_id ON student_group_links(student_group_id);
    `);
    console.log('✅ Student group links junction table created');
  } catch (error) {
    console.error('Error creating student group links junction table:', error);
    throw error;
  }
};

const migrateStudentGroupData = async (db: any) => {
  try {
    // Get all students with group data - only select columns that exist
    let studentsResult;
    try {
      // Try the new approach first (only group_names column)
      studentsResult = await db.query(`
        SELECT id, group_names, user_id FROM students 
        WHERE group_names IS NOT NULL AND group_names != ''
      `);
    } catch (error) {
      // If that fails, try the old approach (with student_group_id)
      try {
        studentsResult = await db.query(`
          SELECT id, student_group_id, group_names, user_id FROM students 
          WHERE student_group_id IS NOT NULL OR group_names IS NOT NULL
        `);
      } catch (fallbackError) {
        console.log('ℹ️  No existing student group data to migrate');
        return;
      }
    }
    
    for (const student of studentsResult.rows) {
      let groupNames = [];
      
      // Handle comma-separated group names first (preferred source)
      if (student.group_names) {
        const names = student.group_names.split(',').map((name: string) => name.trim()).filter((name: string) => name);
        groupNames = [...groupNames, ...names];
      }
      
      // Only use old single group ID if we don't have group_names data
      if (groupNames.length === 0 && student.student_group_id) {
        const groupResult = await db.query(
          'SELECT name FROM student_groups WHERE id = $1',
          [student.student_group_id]
        );
        if (groupResult.rows.length > 0) {
          groupNames.push(groupResult.rows[0].name);
        }
      }
      
      // Remove duplicates
      groupNames = [...new Set(groupNames)];
      
      // Clear any existing links for this student to avoid duplicates
      await db.query(
        'DELETE FROM student_group_links WHERE student_id = $1',
        [student.id]
      );
      
      // Create group associations
      for (const groupName of groupNames) {
        // Ensure the group exists
        let groupResult = await db.query(
          'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
          [student.user_id, groupName]
        );
        
        if (groupResult.rows.length === 0) {
          groupResult = await db.query(
            'INSERT INTO student_groups (user_id, name) VALUES ($1, $2) RETURNING id',
            [student.user_id, groupName]
          );
        }
        
        // Create student-group association
        await db.query(
          `INSERT INTO student_group_links (student_id, student_group_id) VALUES ($1, $2) 
           ON CONFLICT (student_id, student_group_id) DO NOTHING`,
          [student.id, groupResult.rows[0].id]
        );
      }
    }
    
    console.log('✅ Migrated student group data to junction table');
  } catch (error) {
    console.error('Error migrating student group data:', error);
    throw error;
  }
};

const removeOldStudentGroupColumns = async (db: any) => {
  try {
    // Remove the old columns
    await db.query(`
      ALTER TABLE students DROP COLUMN IF EXISTS student_group_id;
      ALTER TABLE students DROP COLUMN IF EXISTS group_names;
    `);
    console.log('✅ Removed old student group columns');
  } catch (error) {
    console.error('Error removing old student group columns:', error);
    // Don't throw - these might already be removed
  }
};

const seedDefaultGradeCategoryTypes = async (db: any) => {
  try {
    // Get all users to seed default categories for each
    const usersResult = await db.query('SELECT id FROM users');
    
    const defaultCategories = [
      { name: 'Lesson', description: 'Regular classroom lessons and homework', is_default: true, is_active: true, color: '#6366f1' },
      { name: 'Review', description: 'Review assignments and practice work', is_default: false, is_active: false, color: '#10b981' },
      { name: 'Quiz', description: 'Short assessments and quizzes', is_default: false, is_active: false, color: '#f59e0b' },
      { name: 'Test', description: 'Major tests and exams', is_default: false, is_active: true, color: '#ef4444' },
      { name: 'Project', description: 'Long-term projects and assignments', is_default: false, is_active: false, color: '#8b5cf6' },
      { name: 'Participation', description: 'Class participation and engagement', is_default: false, is_active: false, color: '#06b6d4' }
    ];
    
    for (const user of usersResult.rows) {
      // Check if user already has categories
      const existingResult = await db.query(
        'SELECT COUNT(*) as count FROM grade_category_types WHERE user_id = $1',
        [user.id]
      );
      
      if (existingResult.rows[0].count === '0') {
        // Insert default categories for this user
        for (const category of defaultCategories) {
          await db.query(`
            INSERT INTO grade_category_types (user_id, name, description, is_default, is_active, color)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (user_id, name) DO NOTHING
          `, [user.id, category.name, category.description, category.is_default, category.is_active, category.color]);
        }
      }
    }
    
    console.log('✅ Seeded default grade category types for all users');
  } catch (error) {
    console.error('Error seeding default grade category types:', error);
    // Don't throw - this is not critical
  }
};

const seedDefaultStudentGroups = async (db: any) => {
  try {
    // Get all users to seed default student groups for each
    const usersResult = await db.query('SELECT id FROM users');
    
    const defaultGroups = [
      { name: 'Grade 1', description: 'First grade students' },
      { name: 'Grade 2', description: 'Second grade students' },
      { name: 'Grade 3', description: 'Third grade students' },
      { name: 'Grade 4', description: 'Fourth grade students' },
      { name: 'Grade 5', description: 'Fifth grade students' },
      { name: 'Grade 6', description: 'Sixth grade students' },
      { name: 'Grade 7', description: 'Seventh grade students' },
      { name: 'Grade 8', description: 'Eighth grade students' },
      { name: 'Grade 9', description: 'Ninth grade students' },
      { name: 'Grade 10', description: 'Tenth grade students' }
    ];
    
    for (const user of usersResult.rows) {
      // Check if user already has groups
      const existingResult = await db.query(
        'SELECT COUNT(*) as count FROM student_groups WHERE user_id = $1',
        [user.id]
      );
      
      if (existingResult.rows[0].count === '0') {
        // Insert default groups for this user
        for (const group of defaultGroups) {
          await db.query(`
            INSERT INTO student_groups (user_id, name, description)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, name) DO NOTHING
          `, [user.id, group.name, group.description]);
        }
      }
    }
    
    console.log('✅ Seeded default student groups for all users');
  } catch (error) {
    console.error('Error seeding default student groups:', error);
    // Don't throw - this is not critical
  }
};

const addUniqueConstraintToStudentGroups = async (db: any) => {
  try {
    // Check if the unique constraint already exists
    const constraintCheck = await db.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'student_groups' 
      AND constraint_type = 'UNIQUE' 
      AND constraint_name LIKE '%user_id%name%'
    `);
    
    if (constraintCheck.rows.length === 0) {
      // Add unique constraint on (user_id, name)
      await db.query(`
        ALTER TABLE student_groups 
        ADD CONSTRAINT student_groups_user_id_name_unique UNIQUE (user_id, name)
      `);
      console.log('✅ Added unique constraint to student_groups table');
    } else {
      console.log('✅ Unique constraint on student_groups already exists');
    }
  } catch (error) {
    console.error('Error adding unique constraint to student_groups:', error);
    // Don't throw - this might fail if constraint already exists
  }
};

const addCategoryIdToLessons = async (db: any) => {
  try {
    // Add category_id column if it doesn't exist
    await db.query(`
      ALTER TABLE lessons 
      ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES grade_category_types(id) ON DELETE SET NULL
    `);
    
    // For any lessons without a category_id, assign them to the default category for their user
    const lessonsWithoutCategory = await db.query(`
      SELECT l.id, s.user_id 
      FROM lessons l 
      JOIN subjects s ON l.subject_id = s.id 
      WHERE l.category_id IS NULL
    `);
    
    for (const lesson of lessonsWithoutCategory.rows) {
      // Get the default category for this user
      const defaultCategoryResult = await db.query(
        'SELECT id FROM grade_category_types WHERE user_id = $1 AND is_default = true ORDER BY created_at LIMIT 1',
        [lesson.user_id]
      );
      
      if (defaultCategoryResult.rows.length > 0) {
        await db.query(
          'UPDATE lessons SET category_id = $1 WHERE id = $2',
          [defaultCategoryResult.rows[0].id, lesson.id]
        );
      }
    }
    
    // Create index for the new foreign key
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_lessons_category_id ON lessons(category_id)
    `);
    
    console.log('✅ Added category_id column to lessons table');
  } catch (error) {
    console.error('Error adding category_id to lessons:', error);
    // Don't throw - this might fail if column already exists
  }
};

const addSchoolSettingsToUsers = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS school_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS first_day_of_school DATE,
      ADD COLUMN IF NOT EXISTS grading_periods INTEGER DEFAULT 6
    `);
    console.log('✅ Added school settings columns to users table');
  } catch (error) {
    console.error('Error adding school settings to users table:', error);
    throw error;
  }
};

const addGradingModeToUsers = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS grading_mode VARCHAR(20) DEFAULT 'dates'
    `);

    await db.query(`
      UPDATE users
      SET grading_mode = 'dates'
      WHERE grading_mode IS NULL
    `);

    console.log('✅ Added grading_mode column to users table');
  } catch (error) {
    console.error('Error adding grading_mode to users table:', error);
    throw error;
  }
};

const createSchoolYearsTable = async (db: any) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS school_years (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        label VARCHAR(20) NOT NULL UNIQUE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT school_years_date_range_check CHECK (start_date <= end_date)
      );

      CREATE INDEX IF NOT EXISTS idx_school_years_date_range ON school_years(start_date, end_date);
    `);
    console.log('✅ School years table created/verified');
  } catch (error) {
    console.error('Error creating school_years table:', error);
    throw error;
  }
};

const createUserSchoolYearLicensesTable = async (db: any) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_school_year_licenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
        granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
        grant_source VARCHAR(40) NOT NULL DEFAULT 'manual',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, school_year_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_school_year_licenses_user ON user_school_year_licenses(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_school_year_licenses_year ON user_school_year_licenses(school_year_id);
    `);
    console.log('✅ User school year licenses table created/verified');
  } catch (error) {
    console.error('Error creating user_school_year_licenses table:', error);
    throw error;
  }
};

const addActiveSchoolYearToUsers = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS active_school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_users_active_school_year_id ON users(active_school_year_id);
    `);
    console.log('✅ Added active_school_year_id to users table');
  } catch (error) {
    console.error('Error adding active_school_year_id to users table:', error);
    throw error;
  }
};

const seedDefaultSchoolYears = async (db: any) => {
  try {
    const currentYear = new Date().getUTCFullYear();
    const startYear = currentYear - 2;
    const endYear = currentYear + 4;

    for (let y = startYear; y <= endYear; y++) {
      const label = `${y}-${y + 1}`;
      const startDate = `${y}-08-01`;
      const endDate = `${y + 1}-07-31`;
      await db.query(
        `INSERT INTO school_years (label, start_date, end_date)
         VALUES ($1, $2::date, $3::date)
         ON CONFLICT (label) DO NOTHING`,
        [label, startDate, endDate]
      );
    }

    console.log('✅ Seeded default school years');
  } catch (error) {
    console.error('Error seeding default school years:', error);
    throw error;
  }
};

const seedInitialUserSchoolYearLicenses = async (db: any) => {
  try {
    const usersResult = await db.query(`
      SELECT id, first_day_of_school, active_school_year_id
      FROM users
    `);

    for (const user of usersResult.rows) {
      const refDate = user.first_day_of_school || new Date().toISOString().slice(0, 10);
      const schoolYearResult = await db.query(
        `SELECT id
         FROM school_years
         WHERE $1::date BETWEEN start_date AND end_date
         ORDER BY start_date DESC
         LIMIT 1`,
        [refDate]
      );

      let fallbackYearId: string | null = schoolYearResult.rows[0]?.id || null;
      if (!fallbackYearId) {
        const fallbackYearResult = await db.query(
          `SELECT id FROM school_years ORDER BY start_date DESC LIMIT 1`
        );
        fallbackYearId = fallbackYearResult.rows[0]?.id || null;
      }

      if (!fallbackYearId) {
        continue;
      }

      await db.query(
        `INSERT INTO user_school_year_licenses (user_id, school_year_id, grant_source, notes)
         VALUES ($1, $2, 'migration', 'Auto-generated during school year migration')
         ON CONFLICT (user_id, school_year_id) DO NOTHING`,
        [user.id, fallbackYearId]
      );

      if (!user.active_school_year_id) {
        await db.query(
          `UPDATE users
           SET active_school_year_id = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [user.id, fallbackYearId]
        );
      }
    }

    console.log('✅ Seeded initial user school year licenses');
  } catch (error) {
    console.error('Error seeding initial user school year licenses:', error);
    throw error;
  }
};

const addSchoolYearScopingToTables = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE student_groups ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE subjects ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE lessons ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE grades ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE grading_periods ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE grading_period_markers ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE student_group_links ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE subject_groups ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE student_subjects ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
      ALTER TABLE subject_weights ADD COLUMN IF NOT EXISTS school_year_id UUID REFERENCES school_years(id) ON DELETE SET NULL;
    `);

    await db.query(`
      UPDATE students st
      SET school_year_id = u.active_school_year_id
      FROM users u
      WHERE st.user_id = u.id AND st.school_year_id IS NULL;

      UPDATE student_groups sg
      SET school_year_id = u.active_school_year_id
      FROM users u
      WHERE sg.user_id = u.id AND sg.school_year_id IS NULL;

      UPDATE subjects sub
      SET school_year_id = u.active_school_year_id
      FROM users u
      WHERE sub.user_id = u.id AND sub.school_year_id IS NULL;

      UPDATE lessons l
      SET school_year_id = sub.school_year_id
      FROM subjects sub
      WHERE l.subject_id = sub.id AND l.school_year_id IS NULL;

      UPDATE grades g
      SET school_year_id = st.school_year_id
      FROM students st
      WHERE g.student_id = st.id AND g.school_year_id IS NULL;

      UPDATE attendance_records ar
      SET school_year_id = st.school_year_id
      FROM students st
      WHERE ar.student_id = st.id AND ar.school_year_id IS NULL;

      UPDATE grading_periods gp
      SET school_year_id = u.active_school_year_id
      FROM users u
      WHERE gp.user_id = u.id AND gp.school_year_id IS NULL;

      UPDATE grading_period_markers gpm
      SET school_year_id = sub.school_year_id
      FROM subjects sub
      WHERE gpm.subject_id = sub.id AND gpm.school_year_id IS NULL;

      UPDATE student_group_links sgl
      SET school_year_id = st.school_year_id
      FROM students st
      WHERE sgl.student_id = st.id AND sgl.school_year_id IS NULL;

      UPDATE subject_groups sg
      SET school_year_id = sub.school_year_id
      FROM subjects sub
      WHERE sg.subject_id = sub.id AND sg.school_year_id IS NULL;

      UPDATE student_subjects ss
      SET school_year_id = st.school_year_id
      FROM students st
      WHERE ss.student_id = st.id AND ss.school_year_id IS NULL;

      UPDATE subject_weights sw
      SET school_year_id = sub.school_year_id
      FROM subjects sub
      WHERE sw.subject_id = sub.id AND sw.school_year_id IS NULL;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_students_user_school_year ON students(user_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_student_groups_user_school_year ON student_groups(user_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_subjects_user_school_year ON subjects(user_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_lessons_subject_school_year ON lessons(subject_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_grades_student_school_year ON grades(student_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_user_school_year ON attendance_records(user_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_grading_periods_user_school_year ON grading_periods(user_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_markers_subject_school_year ON grading_period_markers(subject_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_student_group_links_student_school_year ON student_group_links(student_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_subject_groups_subject_school_year ON subject_groups(subject_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_student_subjects_student_school_year ON student_subjects(student_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_subject_weights_subject_school_year ON subject_weights(subject_id, school_year_id);
    `);

    console.log('✅ Added school_year_id scoping to year-based tables');
  } catch (error) {
    console.error('Error adding school_year_id scoping:', error);
    throw error;
  }
};

const createRolloverScopesTable = async (db: any) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS rollover_scopes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        min_grade INTEGER NOT NULL,
        max_grade INTEGER NOT NULL,
        teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        lock_notes TEXT,
        locked_at TIMESTAMP,
        locked_by_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT rollover_scopes_grade_range_check CHECK (min_grade >= 0 AND max_grade >= min_grade),
        CONSTRAINT rollover_scopes_status_check CHECK (status IN ('draft', 'locked')),
        UNIQUE(user_id, school_year_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_rollover_scopes_user_year ON rollover_scopes(user_id, school_year_id);
      CREATE INDEX IF NOT EXISTS idx_rollover_scopes_teacher ON rollover_scopes(teacher_id);
      CREATE INDEX IF NOT EXISTS idx_rollover_scopes_status ON rollover_scopes(user_id, school_year_id, status);
    `);
    console.log('✅ Rollover scopes table created/verified');
  } catch (error) {
    console.error('Error creating rollover_scopes table:', error);
    throw error;
  }
};

const updateGradesErrorsColumnType = async (db: any) => {
  try {
    await db.query(`
      ALTER TABLE grades 
      ALTER COLUMN errors TYPE DECIMAL(5,2)
    `);
    console.log('✅ Updated grades.errors column to support decimal values');
  } catch (error) {
    console.error('Error updating grades column types:', error);
    throw error;
  }
};

const addColorToGradeCategoryTypes = async (db: any) => {
  try {
    // Add color column if it doesn't exist
    await db.query(`
      ALTER TABLE grade_category_types 
      ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#6366f1'
    `);
    
    console.log('✅ Added color column to grade category types');
  } catch (error) {
    console.error('Error adding color to grade category types:', error);
    throw error;
  }
};

const createUserMetadataTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_metadata (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data_version VARCHAR(20) DEFAULT '2.0.0',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ User metadata table created/verified');
};

const createUserBackupsTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_backups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      backup_timestamp VARCHAR(50) NOT NULL,
      backup_data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, backup_timestamp)
    );
    
    CREATE INDEX IF NOT EXISTS idx_user_backups_user_id ON user_backups(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_backups_timestamp ON user_backups(user_id, backup_timestamp);
  `);
  console.log('✅ User backups table created/verified');
};

const populateUserMetadata = async (db: any) => {
  try {
    // Create default metadata for all existing users
    const usersResult = await db.query('SELECT id FROM users');
    
    for (const user of usersResult.rows) {
      // Insert default metadata if it doesn't exist
      await db.query(`
        INSERT INTO user_metadata (user_id, data_version)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO NOTHING
      `, [user.id, '2.0.0']);
    }
    
    console.log('✅ Populated user metadata for existing users');
  } catch (error) {
    console.error('Error populating user metadata:', error);
    throw error;
  }
};

const addBirthdayToStudents = async (db: any) => {
  try {
    console.log('🔧 Adding birthday column to students table...');
    
    // Add birthday column to students table
    await db.query(`
      ALTER TABLE students 
      ADD COLUMN IF NOT EXISTS birthday DATE
    `);
    
    console.log('✅ Successfully added birthday column to students table');
  } catch (error) {
    console.error('❌ Error adding birthday column to students:', error);
    throw error;
  }
};

// Ensure birthday column is stored as DATE and strip any lingering timezones/times
const coerceBirthdayToDate = async (db: any) => {
  try {
    console.log('🔧 Coercing students.birthday to DATE...');

    // Check current data type
    const typeCheck = await db.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'students' AND column_name = 'birthday'
    `);

    const currentType = typeCheck.rows[0]?.data_type;

    if (currentType && currentType.toLowerCase() !== 'date') {
      await db.query(`
        ALTER TABLE students
        ALTER COLUMN birthday TYPE DATE USING (birthday::date)
      `);
      console.log(`✅ Converted students.birthday from ${currentType} to DATE`);
    } else {
      // Even if already DATE, normalize any rows that might carry time parts
      await db.query(`
        UPDATE students
        SET birthday = birthday::date
        WHERE birthday IS NOT NULL
      `);
      console.log('ℹ️  students.birthday already DATE; normalized existing values');
    }
  } catch (error) {
    console.error('❌ Error coercing students.birthday to DATE:', error);
    throw error;
  }
};

const dropLessonTypeColumn = async (db: any) => {
  try {
    console.log('🔧 Dropping type column from lessons table...');
    
    // Drop the type column from lessons table since we now use category_id foreign key
    await db.query(`
      ALTER TABLE lessons 
      DROP COLUMN IF EXISTS type
    `);
    
    console.log('✅ Successfully dropped type column from lessons table');
  } catch (error) {
    console.error('❌ Error dropping type column from lessons:', error);
    throw error;
  }
};

const createTeachersTable = async (db: any) => {
  try {
    console.log('🔧 Creating teachers table...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID REFERENCES users(id),
        UNIQUE(user_id, email)
      );
      
      CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON teachers(user_id);
      CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);
      CREATE INDEX IF NOT EXISTS idx_teachers_created_by ON teachers(created_by);
    `);
    
    console.log('✅ Teachers table created/verified');
  } catch (error) {
    console.error('❌ Error creating teachers table:', error);
    throw error;
  }
};

const createTeacherGroupLinksTable = async (db: any) => {
  try {
    console.log('🔧 Creating teacher_group_links junction table...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS teacher_group_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        student_group_id UUID NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, student_group_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_teacher_group_links_teacher_id ON teacher_group_links(teacher_id);
      CREATE INDEX IF NOT EXISTS idx_teacher_group_links_group_id ON teacher_group_links(student_group_id);
    `);
    
    console.log('✅ Teacher group links table created/verified');
  } catch (error) {
    console.error('❌ Error creating teacher group links table:', error);
    throw error;
  }
};

const addAutoEnrollmentSetting = async (db: any) => {
  try {
    // Add auto_enroll_subjects column to users table (default to true)
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS auto_enroll_subjects BOOLEAN DEFAULT true
    `);
    
    // Update any existing users who might have null values to use the new default
    await db.query(`
      UPDATE users 
      SET auto_enroll_subjects = true 
      WHERE auto_enroll_subjects IS NULL
    `);
    
    console.log('🔧 Added auto enrollment setting to users table');
    console.log('✅ Successfully added auto enrollment setting to users table');
  } catch (error) {
    console.error('❌ Error adding auto enrollment setting to users table:', error);
    throw error;
  }
};

// Run migrations if this file is executed directly
if (require.main === module) {
  connectDB()
    .then(() => runMigrations())
    .then(() => {
      console.log('All migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}