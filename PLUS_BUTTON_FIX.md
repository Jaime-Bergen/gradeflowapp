# Plus Button (+) Insertion Fix

## Problem
The plus button (+) next to each lesson was failing with the error: **"Cannot find lesson to insert after"**

## Root Cause
The issue was an **index mismatch** between two different arrays:
1. **Rendering array**: Combined array of lessons + markers sorted by `order_index` (used for display)
2. **Data array**: Lessons-only array stored in `subjectLessons[subjectId]` (used for data access)

### What Was Happening
```typescript
// In the rendering code (line 1037):
combinedItems.map((item: any, idx) => {
  // idx is the position in the COMBINED array (lessons + markers)
  return (
    <Button onClick={() => insertLessonAt(subject.id, idx)} />
  );
});

// In the insertLessonAt function (line 246):
async function insertLessonAt(subjectId: string, idx: number) {
  const lessons = subjectLessons[subjectId] || []; // lessons-only array
  const lessonAtIdx = lessons[idx]; // WRONG! idx is from combined array
}
```

### Example Scenario
If you have:
- Lessons at order_index: 1, 2, 3, 4, 5
- Markers at order_index: 2, 4

The combined array would be:
```
[0] Lesson 1 (order_index: 1)
[1] Marker  (order_index: 2)
[2] Lesson 2 (order_index: 3)
[3] Marker  (order_index: 4)
[4] Lesson 3 (order_index: 5)
```

Clicking + on "Lesson 3" passes `idx=4`, but `lessons[4]` is actually "Lesson 5" (or undefined if there are only 3 lessons).

## Solution
Changed the function to accept **order_index** instead of array index:

### 1. Updated Function Signature
```typescript
// BEFORE:
async function insertLessonAt(subjectId: string, idx: number)

// AFTER:
async function insertLessonAt(subjectId: string, afterOrderIndex: number)
```

### 2. Updated Function Logic
```typescript
// BEFORE: Access by array index
const lessonAtIdx = lessons[idx];
const orderIndex = (lessonAtIdx as any).order_index + 1;

// AFTER: Find by order_index value
const lessonAtPosition = lessons.find(l => (l as any).order_index === afterOrderIndex);
const orderIndex = afterOrderIndex + 1;
```

### 3. Updated onClick Handlers
```typescript
// BEFORE: Pass array index
onClick={() => insertLessonAt(subject.id, idx)}

// AFTER: Pass order_index value
onClick={() => insertLessonAt(subject.id, (item as any).order_index)}
```

### 4. Updated "Add Lesson" Button
```typescript
// BEFORE: Calculate index from array length
onClick={() => insertLessonAt(subject.id, (subjectLessons[subject.id]?.length ?? 0) - 1)}

// AFTER: Get order_index from last lesson
onClick={() => {
  const lessons = subjectLessons[subject.id] || [];
  if (lessons.length === 0) {
    toast.error('No lessons found to insert after');
    return;
  }
  const lastLesson = lessons[lessons.length - 1];
  insertLessonAt(subject.id, (lastLesson as any).order_index);
}}
```

## Files Modified
- `src/components/Subjects.tsx`
  - Lines 246-270: Function signature and lookup logic
  - Line 924-935: "Add Lesson" button handler
  - Line 1062: Plus button onClick handler
  - Line 1037: Removed unused `idx` parameter

## Testing Scenarios
✅ Insert after any lesson (with or without markers before it)
✅ Insert after last lesson using "Add Lesson" button
✅ Insert after lessons when markers are interspersed
✅ Smart numbering continues to work (extracts from lesson name)
✅ Points copying continues to work

## Technical Notes
- The fix decouples visual position from data position
- Now relies on `order_index` as the source of truth for positioning
- Works correctly regardless of how many markers are interspersed
- Maintains all existing features: smart numbering, points copying, automatic shifting

## Why This Works
By passing `order_index` instead of array index:
1. We have a **unique identifier** for each lesson's position
2. The value is **independent** of how many markers exist
3. The backend already uses `order_index` for all shifting operations
4. The combined rendering array is only used for display, not for data operations

This fix resolves the fundamental architecture issue of mixing rendering concerns with data access.
