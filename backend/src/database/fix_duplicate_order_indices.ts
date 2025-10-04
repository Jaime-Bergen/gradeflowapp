/**
 * Fix duplicate order_index values in lessons table
 * 
 * This script resequences all lessons within each subject to ensure
 * there are no duplicate order_index values, which can break marker insertion logic.
 */

import { connectDB, getDB } from './connection';

async function fixDuplicateOrderIndices() {
  // First connect to the database
  await connectDB();
  const pool = getDB();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Finding subjects with lessons...');
    
    // Get all subjects
    const subjectsResult = await client.query('SELECT id FROM subjects ORDER BY id');
    const subjects = subjectsResult.rows;
    
    console.log(`Found ${subjects.length} subjects`);
    
    for (const subject of subjects) {
      console.log(`\nProcessing subject ${subject.id}...`);
      
      // Get all lessons for this subject, ordered by current order_index and created_at
      const lessonsResult = await client.query(
        `SELECT id, name, order_index 
         FROM lessons 
         WHERE subject_id = $1 
         ORDER BY order_index ASC, created_at ASC`,
        [subject.id]
      );
      
      const lessons = lessonsResult.rows;
      
      if (lessons.length === 0) {
        console.log('  No lessons found');
        continue;
      }
      
      console.log(`  Found ${lessons.length} lessons`);
      
      // Check for duplicates
      const orderIndices = lessons.map(l => l.order_index);
      const hasDuplicates = orderIndices.length !== new Set(orderIndices).size;
      
      if (hasDuplicates) {
        console.log('  ⚠️  Found duplicate order_index values!');
        
        // Show duplicates
        const duplicates: Record<number, number> = {};
        orderIndices.forEach(idx => {
          duplicates[idx] = (duplicates[idx] || 0) + 1;
        });
        
        Object.entries(duplicates).forEach(([idx, count]) => {
          if (count > 1) {
            console.log(`     order_index ${idx} appears ${count} times`);
          }
        });
      }
      
      // Resequence all lessons starting from 1
      console.log('  Resequencing lessons...');
      for (let i = 0; i < lessons.length; i++) {
        const newOrderIndex = i + 1;
        const lesson = lessons[i];
        
        if (lesson.order_index !== newOrderIndex) {
          await client.query(
            'UPDATE lessons SET order_index = $1 WHERE id = $2',
            [newOrderIndex, lesson.id]
          );
          console.log(`    ${lesson.name}: ${lesson.order_index} → ${newOrderIndex}`);
        }
      }
      
      console.log(`  ✓ Resequenced ${lessons.length} lessons`);
    }
    
    // Also fix markers if needed
    console.log('\n\nChecking grading period markers...');
    
    for (const subject of subjects) {
      const markersResult = await client.query(
        `SELECT id, name, order_index 
         FROM grading_period_markers 
         WHERE subject_id = $1 
         ORDER BY order_index ASC`,
        [subject.id]
      );
      
      const markers = markersResult.rows;
      
      if (markers.length > 0) {
        console.log(`\nSubject ${subject.id}: Found ${markers.length} markers`);
        
        // Renumber markers sequentially
        for (let i = 0; i < markers.length; i++) {
          const newName = `End of Grading Period ${i + 1}`;
          const marker = markers[i];
          
          if (marker.name !== newName) {
            await client.query(
              'UPDATE grading_period_markers SET name = $1 WHERE id = $2',
              [newName, marker.id]
            );
            console.log(`  Renamed: "${marker.name}" → "${newName}"`);
          }
        }
      }
    }
    
    await client.query('COMMIT');
    console.log('\n✅ All order indices fixed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fixing order indices:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the fix
fixDuplicateOrderIndices()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed:', error);
    process.exit(1);
  });
