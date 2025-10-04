# Marker Shift Feature - Up/Down Arrows

## Overview
Added up and down arrow buttons to grading period markers that allow users to reposition markers by swapping their `order_index` with adjacent lessons.

## Feature Description
- **Up Arrow (↑)**: Swaps the marker's position with the lesson immediately above it
- **Down Arrow (↓)**: Swaps the marker's position with the lesson immediately below it
- **Smart Disabling**: Arrows are automatically disabled when:
  - No lesson exists in that direction
  - Marker is adjacent to another marker (can only swap with lessons)
  - Marker is at the very top or bottom of the list

## Implementation Details

### 1. UI Changes
**File**: `src/components/Subjects.tsx`

Added two new icon buttons to each marker:
```tsx
<Button 
  size="icon" 
  variant="ghost" 
  onClick={() => shiftMarker(subject.id, item, 'up')} 
  disabled={!canMoveUp}
  title="Move marker up"
>
  <CaretUp size={14} className={canMoveUp ? "text-red-600" : "text-gray-300"} />
</Button>

<Button 
  size="icon" 
  variant="ghost" 
  onClick={() => shiftMarker(subject.id, item, 'down')} 
  disabled={!canMoveDown}
  title="Move marker down"
>
  <CaretDown size={14} className={canMoveDown ? "text-red-600" : "text-gray-300"} />
</Button>
```

### 2. Logic for Enabling/Disabling Arrows
```typescript
const prevItem = idx > 0 ? combinedItems[idx - 1] : null;
const nextItem = idx < combinedItems.length - 1 ? combinedItems[idx + 1] : null;
const canMoveUp = prevItem && prevItem.type === 'lesson';
const canMoveDown = nextItem && nextItem.type === 'lesson';
```

This ensures:
- Arrows only work when there's an adjacent lesson
- Markers can't swap with other markers
- Visual feedback (gray vs red color) indicates availability

### 3. Core Function: `shiftMarker`
**Location**: Lines 399-460 in `src/components/Subjects.tsx`

**How It Works**:
1. Gets the combined sorted list of lessons + markers
2. Finds the marker's current position
3. Identifies the adjacent lesson in the specified direction
4. Validates that the target is a lesson (not another marker)
5. Swaps the `order_index` values between marker and lesson:
   ```typescript
   await Promise.all([
     apiClient.updateGradingPeriodMarker(marker.id, marker.name, lessonOrderIndex),
     apiClient.updateLesson(targetItem.id, { orderIndex: markerOrderIndex })
   ]);
   ```
6. Refreshes both datasets to reflect the new order
7. Shows success toast

### 4. API Calls Used
- `apiClient.updateGradingPeriodMarker(markerId, name, orderIndex)` - Updates marker position
- `apiClient.updateLesson(lessonId, { orderIndex })` - Updates lesson position
- Both updates happen in parallel using `Promise.all`

## User Experience

### Visual Feedback
- **Enabled arrows**: Red color (text-red-600)
- **Disabled arrows**: Gray color (text-gray-300)
- **Button state**: `disabled` attribute prevents clicks when not applicable

### Toast Messages
- ✅ Success: "Marker moved up" or "Marker moved down"
- ❌ Error: "Cannot move marker up/down" (boundary case)
- ❌ Error: "Can only swap with lessons" (trying to swap with another marker)
- ❌ Error: "Marker not found" (data inconsistency)

## Example Scenarios

### Scenario 1: Marker Between Lessons
```
Lesson 1
Lesson 2
📍 End of Grading Period 1  ← Can move UP or DOWN
Lesson 3
Lesson 4
```
Both arrows enabled - can swap with Lesson 2 (up) or Lesson 3 (down)

### Scenario 2: Marker at Top
```
📍 End of Grading Period 1  ← Only DOWN enabled
Lesson 1
Lesson 2
```
Up arrow disabled (no lesson above), down arrow enabled

### Scenario 3: Marker at Bottom
```
Lesson 1
Lesson 2
📍 End of Grading Period 1  ← Only UP enabled
```
Up arrow enabled, down arrow disabled (no lesson below)

### Scenario 4: Adjacent Markers
```
Lesson 1
📍 End of Grading Period 1  ← Only UP enabled
📍 End of Grading Period 2  ← Only DOWN enabled
Lesson 2
```
Markers can't swap with each other - each can only swap with adjacent lesson

## Technical Notes

### Order Index Management
- The function swaps `order_index` values directly
- No shifting of other items needed (unlike insert/delete)
- Both items are updated in a single transaction
- Data refresh ensures UI is in sync

### Snake_case vs camelCase
- API expects `orderIndex` (camelCase) for lessons
- Backend stores as `order_index` (snake_case)
- Runtime data uses snake_case: `(item as any).order_index`
- Type safety maintained through proper casting

### Combined Array Handling
- Uses the same combined sorted array logic as the lesson + button
- Index tracking (`idx`) used to find prev/next items
- Type checking ensures we only swap with lessons

## Files Modified
- `src/components/Subjects.tsx`:
  - Line 11: Added `CaretUp` import
  - Lines 399-460: Added `shiftMarker` function
  - Lines 1107-1139: Updated marker rendering with arrow buttons and logic

## Future Enhancements (Optional)
- Keyboard shortcuts (Alt+Up/Down) for marker movement
- Drag-and-drop interface for marker repositioning
- Batch move multiple markers at once
- Animation when swapping positions
- Undo/redo for marker movements

## Testing Checklist
✅ Move marker up between lessons
✅ Move marker down between lessons  
✅ Verify disabled state at boundaries
✅ Verify can't swap with another marker
✅ Verify order_index values are correctly swapped
✅ Verify UI updates after move
✅ Verify toast messages appear correctly
✅ Verify marker names remain unchanged after move
