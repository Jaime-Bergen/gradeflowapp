# Order Index Management Fixes

## Problem
The application was creating duplicate `order_index` values when inserting lessons or markers, leading to:
- Confusing behavior where items appeared in the wrong order
- Marker insertion logic breaking
- Gaps in order indices when deleting items

## Root Cause
The lesson and marker insertion logic was not shifting existing items' order indices before inserting new items, causing duplicates. The database would then return items in creation order for items with the same order_index.

## Solutions Implemented

### 1. Fixed Lesson Insertion (`backend/src/routes/lessons.ts`)
**Before:** Created lesson with provided order_index without shifting existing items
**After:** 
- Shifts all lessons with `order_index >= newOrderIndex` up by 1
- Shifts all markers with `order_index >= newOrderIndex` up by 1
- Then inserts the new lesson at the correct position

### 2. Fixed Lesson Deletion (`backend/src/routes/lessons.ts`)
**Before:** Just deleted the lesson, leaving a gap in order indices
**After:**
- Deletes the lesson
- Shifts all lessons with `order_index > deletedOrderIndex` down by 1
- Shifts all markers with `order_index > deletedOrderIndex` down by 1

### 3. Marker Insertion (Already Correct)
`backend/src/routes/gradingPeriodMarkers.ts` already properly shifts both lessons and markers before inserting.

### 4. Marker Deletion (Already Correct)
`backend/src/routes/gradingPeriodMarkers.ts` already properly shifts both lessons and markers after deleting.

### 5. Fixed Duplicate Order Indices in Database
Created and ran `backend/src/database/fix_duplicate_order_indices.ts` to:
- Resequence all lessons within each subject to have unique, sequential order_index values
- Renumber all markers sequentially

## UI Changes

### Simplified Marker Insertion
- Removed individual amber "+" buttons next to each lesson for adding markers
- Kept the main "📍 Add Grading Period Marker" button which opens a dialog
- Dialog shows all possible insertion positions (beginning, after each item, end)
- User must select a position before the "Add Marker" button is enabled

### Kept Lesson Insertion
- Blue "+" buttons next to each lesson remain for inserting new lessons at that position

## Testing Checklist

✅ **Lesson Insertion**
- [ ] Insert a lesson at the beginning
- [ ] Insert a lesson in the middle
- [ ] Insert a lesson at the end
- [ ] Verify no duplicate order_index values
- [ ] Verify all items appear in correct order

✅ **Lesson Deletion**
- [ ] Delete a lesson from the beginning
- [ ] Delete a lesson from the middle
- [ ] Delete a lesson from the end
- [ ] Verify no gaps in order_index sequence
- [ ] Verify markers maintain correct positions

✅ **Marker Insertion**
- [ ] Open "Add Marker" dialog
- [ ] Select "At the beginning"
- [ ] Select "After [specific lesson]"
- [ ] Select "At the end"
- [ ] Verify marker appears at correct position
- [ ] Verify no duplicate order_index values

✅ **Marker Deletion**
- [ ] Delete a marker
- [ ] Verify lessons maintain correct positions
- [ ] Verify remaining markers are renumbered correctly
- [ ] Verify no gaps in order_index sequence

✅ **Combined Operations**
- [ ] Insert lessons, then markers, verify order
- [ ] Delete markers, then lessons, verify order
- [ ] Mix insertions and deletions, verify order always correct

## Database Schema
Both `lessons` and `grading_period_markers` tables have:
- `subject_id`: Links to the parent subject
- `order_index`: Integer representing position within the subject (1, 2, 3, ...)

Items are displayed by sorting on `order_index ASC`.

## Future Considerations
- Consider adding a database constraint to prevent duplicate order_index values within a subject
- Consider using a library like `fractional-indexing` for more efficient reordering without shifting all items
- Monitor performance if subjects have hundreds of lessons/markers (current shifting approach is O(n))
