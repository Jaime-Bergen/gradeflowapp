# Grading Period Marker Insertion Fix

## Problem Identified

The root cause of marker insertion issues was that the lesson insertion logic was creating **duplicate `order_index` values** rather than shifting existing items. This caused:

1. Multiple lessons with the same `order_index` 
2. Apparent correct ordering only because the database returned items sorted by `created_at` timestamp
3. Confusion when trying to insert markers at specific positions
4. The backend marker insertion logic (which properly shifts order indices) working on incorrect/duplicate index values

## Solution Implemented

### 1. Database Cleanup (✅ Completed)

Created and ran `backend/src/database/fix_duplicate_order_indices.ts`:
- Resequenced all lessons within each subject to have unique, sequential `order_index` values (1, 2, 3, ...)
- Fixed 144 lessons in subject with duplicates at indices 93 and 94
- Renumbered grading period markers sequentially
- All changes committed in a database transaction

### 2. Backend Fix for Single Lesson Insertion

**File**: `backend/src/routes/lessons.ts`

**Before**: When creating a single lesson, it would just insert with the provided `orderIndex` without shifting:
```typescript
// Old code - creates duplicates
await pool.query(
  'INSERT INTO lessons (subject_id, name, category_id, points, order_index) VALUES ...'
);
```

**After**: Now properly shifts existing lessons and markers before insertion:
```typescript
// Shift lessons with order_index >= orderIndex
await pool.query(
  'UPDATE lessons SET order_index = order_index + 1 WHERE subject_id = $1 AND order_index >= $2',
  [subjectId, orderIndex]
);

// Shift markers with order_index >= orderIndex  
await pool.query(
  'UPDATE grading_period_markers SET order_index = order_index + 1 WHERE subject_id = $1 AND order_index >= $2',
  [subjectId, orderIndex]
);

// Then insert the new lesson
```

This matches the existing behavior in `gradingPeriodMarkers.ts` which already had proper shifting logic.

### 3. UI Simplification

**File**: `src/components/Subjects.tsx`

**Removed**:
- Amber "+" buttons next to each lesson for adding markers (confusing UX with multiple entry points)
- Red "+" buttons next to each marker for adding more markers
- Console.log debugging statements

**Kept**:
- Blue "+" buttons next to lessons for inserting new lessons (this is the main use case)
- Main "📍 Add Marker" button that opens a dialog with all position options
- Edit and Delete buttons for both lessons and markers

**Dialog Behavior**:
- When clicked from the main button, no option is pre-selected
- User must select a position from the list
- "Add Marker" button is disabled until a position is selected
- Options include: "At the beginning", "After [lesson/marker name]...", "At the end"
- Selected option is highlighted with accent background and primary border

## How It Works Now

### Adding a Marker:
1. Click "📍 Add Marker" button in the subject's lesson list
2. Dialog opens showing all possible insertion positions
3. Select where you want to insert the marker
4. Click "Add Marker"
5. Backend properly shifts all lessons and markers at or after that position
6. New marker is inserted with correct sequential name ("End of Grading Period 1", etc.)

### Adding a Lesson:
1. Click blue "+" button next to an existing lesson
2. Lesson is inserted immediately after the clicked lesson
3. Backend shifts all subsequent lessons and markers
4. New lesson gets unique, sequential `order_index`

### Order Index Integrity:
- No duplicate `order_index` values can be created
- All items maintain sequential, unique indices
- Database returns items in correct order regardless of `created_at` timestamps
- Marker insertion always goes to the correct position

## Testing Checklist

- [x] Database has no duplicate `order_index` values
- [ ] Can add marker at the beginning of lesson list
- [ ] Can add marker in the middle of lesson list  
- [ ] Can add marker at the end of lesson list
- [ ] Marker appears at correct position immediately
- [ ] Lessons before marker maintain their order
- [ ] Lessons after marker maintain their order (with shifted indices)
- [ ] Can add lesson using "+" button - it inserts at correct position
- [ ] Multiple markers can be added and appear in correct positions
- [ ] Deleting a marker renumbers remaining markers correctly
- [ ] No duplicate order_index values are created

## Files Modified

1. ✅ `backend/src/database/fix_duplicate_order_indices.ts` - New cleanup script
2. ✅ `backend/src/routes/lessons.ts` - Fixed single lesson insertion to shift indices
3. ✅ `src/components/Subjects.tsx` - Removed amber/red marker buttons, cleaned up UI

## Next Steps

1. Test marker insertion at various positions
2. Test lesson insertion at various positions
3. Verify no duplicate order_index values are created
4. Consider adding a database constraint to prevent future duplicates:
   ```sql
   ALTER TABLE lessons ADD CONSTRAINT unique_subject_order 
   UNIQUE (subject_id, order_index);
   
   ALTER TABLE grading_period_markers ADD CONSTRAINT unique_subject_order 
   UNIQUE (subject_id, order_index);
   ```
