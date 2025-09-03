import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function migrate() {
  try {
    // 1. Get all kv_store keys
    const kvRes = await pool.query('SELECT key, value, user_id FROM kv_store');
    const kvRows = kvRes.rows;

    let studentsInserted = 0;
    let subjectsInserted = 0;
    let gradesInserted = 0;
    let lessonsInserted = 0;
    let studentGroupsInserted = 0;

    // Print all keys for debugging
    console.log('All kv_store keys:');
    for (const row of kvRows) {
      console.log(row.key);
    }

    for (const row of kvRows) {
      const { key, value, user_id } = row;
      let parsed = value;
      // Try to parse value if it's a string
      if (typeof value === 'string') {
        try {
          parsed = JSON.parse(value);
        } catch (e) {
          // Not JSON, skip
          continue;
        }
      }

      // Match keys like 'user:{user_id}:students', etc.
      const match = key.match(/^user:([\w-]+):(students|subjects|grades|lessons|student_groups)$/);
      if (!match) continue;
      const dataType = match[2];

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (dataType === 'students') {
            await pool.query(
              'INSERT INTO students (id, name, group_id, user_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
              [item.id, item.name, item.group_id || null, user_id]
            );
            studentsInserted++;
          } else if (dataType === 'subjects') {
            await pool.query(
              'INSERT INTO subjects (id, name, user_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
              [item.id, item.name, user_id]
            );
            subjectsInserted++;
          } else if (dataType === 'grades') {
            await pool.query(
              'INSERT INTO grades (id, student_id, lesson_id, value, user_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
              [item.id, item.student_id, item.lesson_id, item.value, user_id]
            );
            gradesInserted++;
          } else if (dataType === 'lessons') {
            await pool.query(
              'INSERT INTO lessons (id, subject_id, name, user_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
              [item.id, item.subject_id, item.name, user_id]
            );
            lessonsInserted++;
          } else if (dataType === 'student_groups') {
            await pool.query(
              'INSERT INTO student_groups (id, name, user_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
              [item.id, item.name, user_id]
            );
            studentGroupsInserted++;
          }
        }
      }
    }

    console.log(`Migration complete.`);
    console.log(`Students inserted: ${studentsInserted}`);
    console.log(`Subjects inserted: ${subjectsInserted}`);
    console.log(`Grades inserted: ${gradesInserted}`);
    console.log(`Lessons inserted: ${lessonsInserted}`);
    console.log(`Student groups inserted: ${studentGroupsInserted}`);
  } finally {
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
