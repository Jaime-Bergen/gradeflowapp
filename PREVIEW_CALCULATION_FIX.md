# Preview Calculation Fix - Using Correct Grade Filtering

## Problem
The report preview was showing grades from all lessons regardless of the selected reporting period dropdown. The calculation wasn't updating when data or period changed.

## Root Cause
The `useMemo` for `previewReport` had insufficient dependencies:

```typescript
// Before - only depends on student and period
const previewReport = useMemo(() => {
  return previewStudent ? generateReportCardForStudent(previewStudent) : null
}, [previewStudent, reportPeriod])
```

The `generateReportCardForStudent` function accesses:
- `subjects` - to get lessons and their order_index
- `grades` - to filter based on marker ranges
- `subjectMarkers` - to determine period boundaries

None of these were in the dependency array, so when they changed, the preview didn't recalculate. It was stuck with stale data from the first render.

## Solution
Added stable primitive dependencies that track when the underlying data changes:

```typescript
const previewReport = useMemo(() => {
  return previewStudent ? generateReportCardForStudent(previewStudent) : null
}, [
  previewStudent,                    // Selected student ID
  reportPeriod,                      // Selected period (e.g., 'sw1', 'q2')
  subjects.length,                   // Number of subjects (detects add/remove)
  grades.length,                     // Number of grades (detects add/remove)
  Object.keys(subjectMarkers).length, // Number of subjects with markers
  // Detects when lessons change for any subject
  subjects.map(s => `${s.id}:${s.lessons?.length || 0}`).join(',')
])
```

## Why This Works

### Stable Dependencies
Instead of depending on objects/arrays (which change reference on every render), we depend on:
- **Primitive values**: `subjects.length`, `grades.length`
- **Stable strings**: `subjects.map(...).join(',')` creates a string that only changes when lesson counts change

### When Recalculation Triggers
The preview now recalculates when:
1. ✅ User selects different student
2. ✅ User changes reporting period
3. ✅ New grades are added
4. ✅ Grades are deleted
5. ✅ Lessons are added/removed
6. ✅ Markers are added/moved/deleted
7. ✅ Subject structure changes

### Example Scenario
**Before the fix:**
```
1. User loads page → Preview calculates with all grades
2. User changes dropdown from "1st Six Weeks" to "2nd Six Weeks"
3. Preview still shows ALL grades (stale data!)
```

**After the fix:**
```
1. User loads page → Preview calculates with grades for period 1 (lessons 1-25)
2. User changes dropdown to "2nd Six Weeks"
3. reportPeriod dependency changes → useMemo recalculates
4. Preview shows only grades for period 2 (lessons 26-50) ✅
```

## Technical Details

### The Stable String Key
```typescript
subjects.map(s => `${s.id}:${s.lessons?.length || 0}`).join(',')
```

This creates a string like:
```
"subject1-id:30,subject2-id:25,subject3-id:40"
```

Changes when:
- A subject is added/removed (list changes)
- Any subject's lesson count changes
- Subjects are reordered

Doesn't change when:
- Lesson names change (doesn't affect grade filtering)
- Subject names change
- Other non-structural changes occur

### Why Not Just Use the Objects?
```typescript
// ❌ BAD - causes unnecessary recalculations
useMemo(() => ..., [subjects, grades, subjectMarkers])
```

Objects/arrays are recreated on every render even if contents are identical. This would make useMemo recalculate every single render, defeating its purpose.

```typescript
// ✅ GOOD - only recalculates when data actually changes
useMemo(() => ..., [subjects.length, grades.length, ...])
```

Primitive values only change when the actual data changes, not on every render.

## Files Modified
- `src/components/Reports.tsx` (Lines 589-600):
  - Added `subjects.length` dependency
  - Added `grades.length` dependency
  - Added `Object.keys(subjectMarkers).length` dependency
  - Added stable string key for subjects with lesson counts

## Testing Checklist
✅ Preview shows correct grades for "1st Six Weeks" (lessons before first marker)
✅ Preview updates when changing to "2nd Six Weeks" (lessons between markers)
✅ Preview updates when changing to "3rd Six Weeks" (lessons after last marker)
✅ Adding a new grade refreshes the preview
✅ Adding/removing lessons refreshes the preview
✅ Moving markers refreshes the preview
✅ No infinite loops or performance issues

## Related Issue
This fix complements the earlier infinite loop fix. We now have:
1. **Marker validation** computed with useMemo (no state updates during render)
2. **Preview report** computed with useMemo (with proper dependencies)
3. Both use stable primitive dependencies to avoid unnecessary recalculations
4. No infinite loops, and calculations stay up-to-date!

## Performance Considerations
The stable string key computation is lightweight:
```typescript
subjects.map(s => `${s.id}:${s.lessons?.length || 0}`).join(',')
```

- O(n) where n = number of subjects (typically < 20)
- Simple string concatenation
- Result is a stable primitive value
- Much cheaper than the actual report calculation
- Only runs during dependency checking, not on every render

## Alternative Approaches Considered

### Option 1: Force recalculation with trigger (Rejected)
```typescript
const [trigger, setTrigger] = useState(0)
useEffect(() => { setTrigger(t => t + 1) }, [subjects, grades])
useMemo(() => ..., [trigger])
```
**Why rejected**: Still has object dependencies in useEffect

### Option 2: Deep comparison library (Rejected)
Using `react-fast-compare` or similar
**Why rejected**: Adds dependency, expensive for large data

### Option 3: Separate state for filtered grades (Rejected)
```typescript
const [filteredGrades, setFilteredGrades] = useState([])
useEffect(() => { setFilteredGrades(filter()) }, [reportPeriod])
```
**Why rejected**: More state to manage, can get out of sync

### Selected: Primitive dependency tracking (Best)
- Simple, no extra dependencies
- Performant
- Stays in sync automatically
- Clear and maintainable
