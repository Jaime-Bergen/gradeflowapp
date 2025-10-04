# Order Index Fix Summary

## Problem Identified

The root cause of the grading period marker insertion bug was **duplicate `order_index` values** in the database.

### What Was Happening

1. When inserting a new lesson through the POST `/api/lessons/subject/:subjectId` endpoint, the backend would:
   - Accept an `orderIndex` parameter
   - Insert the new lesson with that `orderIndex`
   - **NOT shift existing lessons with the same or higher order_index**

2. This created duplicate `order_index` values in the database:
   ```sql
   Lesson 93: order_index = 93
   Lesson 94: order_index = 93  -- DUPLICATE!
   Lesson 95: order_index = 94
   Lesson 96: order_index = 94  -- DUPLICATE!
   ```

3. The database would then return lessons ordered by `order_index ASC, created_at ASC`, which made it **appear** correct in the UI but was fundamentally broken.

4. When inserting grading period markers, the backend's shift logic would get confused by duplicate order indices, causing markers to be inserted at wrong positions.

## Fixes Applied

### 1. Database Cleanup Script

Created `backend/src/database/fix_duplicate_order_indices.ts` which:
- Scans all subjects
- Identifies lessons with duplicate `order_index` values
- Resequences all lessons to have unique, sequential indices (1, 2, 3, ...)
- Renumbers grading period markers with proper names

**Run the script:**
```bash
cd backend
npx tsx src/database/fix_duplicate_order_indices.ts
```

**Results:**
- Fixed subject `73890bcd-bd66-4e6f-8bc8-818d82d97693` with 144 lessons
- Corrected duplicates at indices 93, 94, 141, etc.
- All lessons now have unique sequential order_index values

### 2. Lesson Insertion Route Fix

Updated `backend/src/routes/lessons.ts` POST endpoint to:
```typescript
// Shift order indices of existing lessons and markers that come after this one
await db.query(
  'UPDATE lessons SET order_index = order_index + 1 WHERE subject_id = $1 AND order_index >= $2',
  [subjectId, orderIndex ?? 0]
);

await db.query(
  'UPDATE grading_period_markers SET order_index = order_index + 1 WHERE subject_id = $1 AND order_index >= $2',
  [subjectId, orderIndex ?? 0]
);
```

This matches the behavior of the grading period marker insertion route, which was already doing this correctly.

## Comparison: Marker vs Lesson Insertion

### Marker Insertion (CORRECT - Already Implemented)
File: `backend/src/routes/gradingPeriodMarkers.ts`

```typescript
// Shift order indices of markers that come after this one
await db.query(
  'UPDATE grading_period_markers SET order_index = order_index + 1 
   WHERE subject_id = $1 AND order_index >= $2',
  [subjectId, orderIndex]
);

// Also shift lesson order indices
await db.query(
  'UPDATE lessons SET order_index = order_index + 1 
   WHERE subject_id = $1 AND order_index >= $2',
  [subjectId, orderIndex]
);

// Then insert the marker
await db.query(
  'INSERT INTO grading_period_markers (subject_id, name, order_index) 
   VALUES ($1, $2, $3) RETURNING *',
  [subjectId, markerName, orderIndex]
);
```

### Lesson Insertion (NOW FIXED)
File: `backend/src/routes/lessons.ts`

**Before (BROKEN):**
```typescript
// Just insert directly - creates duplicates!
const { rows } = await db.query(
  'INSERT INTO lessons (subject_id, name, category_id, points, order_index) 
   VALUES ($1, $2, $3, $4, $5) RETURNING *',
  [subjectId, name, categoryId, maxPoints, orderIndex ?? 0]
);
```

**After (FIXED):**
```typescript
// Shift order indices of existing lessons and markers that come after this one
await db.query(
  'UPDATE lessons SET order_index = order_index + 1 
   WHERE subject_id = $1 AND order_index >= $2',
  [subjectId, orderIndex ?? 0]
);

await db.query(
  'UPDATE grading_period_markers SET order_index = order_index + 1 
   WHERE subject_id = $1 AND order_index >= $2',
  [subjectId, orderIndex ?? 0]
);

// Then insert the lesson
const { rows } = await db.query(
  'INSERT INTO lessons (subject_id, name, category_id, points, order_index) 
   VALUES ($1, $2, $3, $4, $5) RETURNING *',
  [subjectId, name, categoryId, maxPoints, orderIndex ?? 0]
);
```

## Testing Checklist

### 1. Test Marker Insertion
- [ ] Refresh the frontend to reload lesson data
- [ ] Click the amber "+" button next to a lesson in the middle of the list (e.g., Lesson 25)
- [ ] Verify the dialog shows "After Lesson 25" pre-selected
- [ ] Click "Add Marker"
- [ ] Verify the marker appears AFTER Lesson 25, not at the end
- [ ] Check console logs to see the correct orderIndex being sent
- [ ] Verify Lesson 26 and all subsequent lessons have their order_index shifted by 1

### 2. Test Lesson Insertion
- [ ] Add a new single lesson through the UI
- [ ] If there's UI to insert in the middle (not bulk add), test that
- [ ] Verify no duplicate order_index values are created
- [ ] Verify existing lessons and markers are shifted correctly

### 3. Database Verification
Run this query to check for duplicates:
```sql
SELECT subject_id, order_index, COUNT(*) 
FROM (
  SELECT subject_id, order_index FROM lessons
  UNION ALL
  SELECT subject_id, order_index FROM grading_period_markers
) combined
GROUP BY subject_id, order_index
HAVING COUNT(*) > 1;
```

Should return **no rows** after the fix.

### 4. Bulk Lesson Addition
- [ ] Use the "Add Lessons" feature to add multiple lessons at once
- [ ] Verify they get sequential order_index values
- [ ] Verify they don't conflict with existing lessons or markers

## Potential Future Issues

### Lesson Update Route
The PUT endpoint at `backend/src/routes/lessons.ts` line 131 also allows changing `order_index`:

```typescript
UPDATE lessons SET name = $1, category_id = $2, points = $3, order_index = $4 
WHERE id = $5
```

**If the frontend ever implements drag-and-drop reordering**, this route will need similar shifting logic to prevent duplicates.

### Recommended Solution for Reordering
If implementing drag-and-drop:
1. Calculate the new desired position
2. Get the current position
3. If moving down: shift items between old and new position DOWN by 1
4. If moving up: shift items between new and old position UP by 1
5. Update the dragged item to the new position

## Files Modified

1. `backend/src/database/fix_duplicate_order_indices.ts` (NEW)
   - Database cleanup script
   
2. `backend/src/routes/lessons.ts`
   - Fixed POST `/api/lessons/subject/:subjectId` endpoint
   - Added order_index shifting before insertion

## Files That Were Already Correct

1. `backend/src/routes/gradingPeriodMarkers.ts`
   - POST endpoint already shifted order indices correctly
   - Served as the reference implementation for the fix

## Summary

The lesson insertion was creating duplicate order_index values instead of properly shifting existing items. This made the grading period marker insertion appear broken, when actually both systems were relying on database ordering by `created_at` to mask the underlying duplicate index problem.

The fix ensures that:
1. All existing duplicates are cleaned up
2. Future lesson insertions will shift existing items
3. Future marker insertions continue to work correctly (they already did)
4. The order_index values remain unique and sequential
