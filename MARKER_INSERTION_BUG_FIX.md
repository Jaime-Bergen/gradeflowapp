# Marker Insertion Bug Fix

## Problem 1: Wrong Position on First Insert
Grading period markers were always being inserted at order_index 1, regardless of which position the user selected in the dialog.

### Root Cause
**Snake_case vs camelCase mismatch:**
- Backend returns data with `order_index` (snake_case)
- Frontend TypeScript interfaces define `orderIndex` (camelCase)
- Frontend code was trying to access `item.orderIndex` on data that had `order_index`
- This resulted in `undefined`, which defaulted to `0`
- Calculated position would be `0 + 1 = 1`, always inserting at position 1

### Example
When selecting "After Lesson 25" (which has `order_index: 25`):
```javascript
// BEFORE (broken):
const value = (item.orderIndex ?? 0) + 1;  // orderIndex is undefined → 0 + 1 = 1

// AFTER (fixed):
const value = (item.order_index ?? 0) + 1;  // order_index is 25 → 25 + 1 = 26
```

## Problem 2: Wrong Position on Subsequent Inserts
After inserting the first marker correctly, subsequent markers would be inserted at wrong positions:
- Select "After Lesson 50" → Inserted after Lesson 51 (off by 1)
- Select "After Lesson 100" → Inserted after Lesson 99 (off by too much)
- After page refresh, positions would be corrected

### Root Cause
**Stale order_index data:**
- When a marker/lesson is inserted, the backend shifts all subsequent items' order_index values by +1
- The frontend was only refreshing markers, not lessons
- On next insertion, the frontend was using old (stale) order_index values from lessons
- Example: After inserting marker at position 26, Lesson 50 is now at order_index 51, but frontend still thinks it's at 50

### Example
```
Initial state: Lesson 50 has order_index: 50

User inserts marker at position 26
Backend shifts: Lesson 50 is now at order_index: 51
Frontend state: Still thinks Lesson 50 has order_index: 50 (stale!)

User selects "After Lesson 50"
Calculation: 50 + 1 = 51 (should be 51 + 1 = 52)
Result: Marker inserted at wrong position
```

## Files Changed

### `src/components/Subjects.tsx`

1. **openAddMarkerDialog function** (lines 505-520)
   - Changed `a.orderIndex` → `a.order_index`
   - Changed `item.orderIndex` → `item.order_index`
   - Changed "At the beginning" value from `0` to `1` (order indices start at 1)
   
2. **Add Marker Dialog rendering** (lines 1190-1220)
   - Changed `a.orderIndex` → `a.order_index`
   - Changed `item.orderIndex` → `item.order_index`
   - Changed "At the beginning" value from `0` to `1`
   
3. **Main lessons/markers list rendering** (lines 985-995)
   - Changed `a.orderIndex` → `a.order_index`
   - Added type casting `(a as any)` to avoid TypeScript errors

4. **insertGradingPeriodMarker function**
   - Added refresh of lessons data after inserting marker
   - Changed from fetching only markers to fetching both lessons and markers
   - `Promise.all([markersRes, lessonsRes])`

5. **deleteGradingPeriodMarker function**
   - Added refresh of lessons data after deleting marker
   - Changed from fetching only markers to fetching both lessons and markers
   - `Promise.all([markersRes, lessonsRes])`

6. **handleDeleteLesson function**
   - Changed from filtering local state to refetching from backend
   - Added refresh of markers data after deleting lesson
   - `Promise.all([lessonsRes, markersRes])`

7. **insertLessonAt function**
   - Added refresh of markers data after inserting lesson
   - Changed from fetching only lessons to fetching both lessons and markers
   - `Promise.all([lessonsRes, markersRes])`

### Removed Debug Logging
- Removed console.log from `src/components/Subjects.tsx`
- Removed console.log from `src/lib/api.ts`
- Removed console.log from `backend/src/routes/gradingPeriodMarkers.ts`

## Key Principle
**Whenever order_index values are modified on the backend, refresh ALL affected data on the frontend:**
- Insert marker → Refresh lessons AND markers
- Delete marker → Refresh lessons AND markers  
- Insert lesson → Refresh lessons AND markers
- Delete lesson → Refresh lessons AND markers

This ensures the frontend always has current order_index values for accurate position calculations.

## Testing
After refreshing the page (to get fresh data from backend):

✅ **Insert first marker after Lesson 25** → Should appear at order_index 26
✅ **Insert second marker after Lesson 50** → Should appear at order_index 52 (not 51!)
✅ **Insert third marker after Lesson 100** → Should appear at order_index 103 (accounting for previous shifts)
✅ **Delete a marker** → All subsequent items should shift down correctly
✅ **Delete a lesson** → All subsequent items should shift down correctly
✅ **Insert a lesson** → All subsequent items should shift up correctly

## Related Issues Fixed Previously
1. ✅ Lesson insertion now shifts order indices
2. ✅ Lesson deletion now closes gaps
3. ✅ Database duplicate order_index values cleaned up
4. ✅ Marker insertion/deletion shifting logic (was already correct)

## Future Consideration
Consider adding a data transformation layer that converts backend snake_case to frontend camelCase to prevent this type of bug. Or standardize on one naming convention across the entire stack.
