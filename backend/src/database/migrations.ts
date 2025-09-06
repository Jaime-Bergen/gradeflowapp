import { getDB } from './connection';

export const runMigrations = async (): Promise<void> => {
  const db = getDB();
  
  try {
    // Create tables in order of dependencies
    await createUsersTable(db);
    await createStudentGroupsTable(db);
    await createStudentsTable(db);
    await createGradeCategoryTypesTable(db);
    await addIsActiveToGradeCategoryTypes(db);
    await createSubjectsTable(db);
    await addReportCardNameToSubjects(db);
    await addSchoolSettingsToUsers(db);
    await createLessonsTable(db);
    await createGradesTable(db);
    await createStudentSubjectsTable(db);
    await createSubjectWeightsTable(db);
    await createUserMetadataTable(db);
    await createUserBackupsTable(db);
    
    // Run essential data migrations only
    await createSubjectGroupsJunctionTable(db);
    await createStudentGroupLinksJunctionTable(db);
    await removeLessonTypeConstraint(db);
    await removeLegacyWeightColumns(db);
    await updateGradesErrorsColumnType(db);
    await addColorToGradeCategoryTypes(db);
    await seedDefaultGradeCategoryTypes(db);
    await populateUserMetadata(db);
    
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
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

const createGradeCategoryTypesTable = async (db: any) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS grade_category_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_default BOOLEAN DEFAULT false,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );
    
    CREATE INDEX IF NOT EXISTS idx_grade_category_types_user_id ON grade_category_types(user_id);
    CREATE INDEX IF NOT EXISTS idx_grade_category_types_sort_order ON grade_category_types(user_id, sort_order);
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
      type VARCHAR(50) DEFAULT 'lesson',
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
    
    // Update sort_order to be auto-managed based on creation order
    await db.query(`
      UPDATE grade_category_types 
      SET sort_order = (
        SELECT ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1
        FROM grade_category_types gct2 
        WHERE gct2.id = grade_category_types.id
      )
    `);
    
    console.log('✅ Added color column and updated sort_order to be auto-managed');
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

const addCategoryIdToLessons = async (db: any) => {
  try {
    // Add category_id column as foreign key to grade_category_types
    await db.query(`
      ALTER TABLE lessons 
      ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES grade_category_types(id) ON DELETE SET NULL
    `);
    
    // Migrate existing lesson types to category_id foreign keys
    // For each user, find or create matching category types and update lessons
    const usersResult = await db.query(`
      SELECT DISTINCT u.id as user_id 
      FROM users u 
      JOIN subjects s ON s.user_id = u.id 
      JOIN lessons l ON l.subject_id = s.id
    `);
    
    for (const user of usersResult.rows) {
      // Get all unique lesson types for this user's lessons
      const lessonTypesResult = await db.query(`
        SELECT DISTINCT l.type 
        FROM lessons l 
        JOIN subjects s ON l.subject_id = s.id 
        WHERE s.user_id = $1 AND l.type IS NOT NULL
      `, [user.user_id]);
      
      for (const typeRow of lessonTypesResult.rows) {
        const typeName = typeRow.type;
        
        // Find or create matching category type
        let categoryResult = await db.query(`
          SELECT id FROM grade_category_types 
          WHERE user_id = $1 AND name = $2
        `, [user.user_id, typeName]);
        
        if (categoryResult.rows.length === 0) {
          // Create new category type for this lesson type
          categoryResult = await db.query(`
            INSERT INTO grade_category_types (user_id, name, description, is_default, sort_order, color) 
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING id
          `, [
            user.user_id, 
            typeName, 
            `Auto-migrated from lesson type: ${typeName}`,
            typeName.toLowerCase() === 'lesson',
            999, // High sort order for migrated types
            '#6366f1' // Default color
          ]);
        }
        
        const categoryId = categoryResult.rows[0].id;
        
        // Update all lessons of this type for this user
        await db.query(`
          UPDATE lessons 
          SET category_id = $1 
          WHERE subject_id IN (
            SELECT id FROM subjects WHERE user_id = $2
          ) AND type = $3 AND category_id IS NULL
        `, [categoryId, user.user_id, typeName]);
      }
    }
    
    // Create index for the new foreign key
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_lessons_category_id ON lessons(category_id)
    `);
    
    console.log('✅ Added category_id foreign key to lessons and migrated existing data');
  } catch (error) {
    console.error('Error adding category_id to lessons:', error);
    throw error;
  }
};