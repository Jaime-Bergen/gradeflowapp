# Grade Calculation Breakdown Fix

## Problem
The grade calculation breakdown display was showing all grades instead of only the grades within the selected reporting period.

**Symptom:**
- Overall average: 93.7% (correct - using filtered grades)
- Breakdown display: Shows 18 grades with average 92.5% (incorrect - using all grades)
- Mismatch between the final percentage and the breakdown calculation

**Example:**
```
93.7%
Grade Calculation:
Lesson:
92.5% (Weight: 34%)
Grades: 90, 98, 93, 100, 91, 89, 96, 94, 94, 90, 87, 90, 87, 98, 93, 91, 97, 87 → Avg: 92.5%
Weighted: 92.5% × 34% = 31.5
Final: 31.5 ÷ 34% = 92.5%  ← Should be 93.7%!
```

## Root Cause
Two different code paths were using different grade sets:

### Path 1: Report Generation (Correct)
```typescript
const generateReportCardForStudent = (studentId: string) => {
  // ... filtering logic ...
  const filteredGrades = grades.filter(grade => {
    // Complex filtering based on markers
  })
  return generateReportCard(studentId, reportPeriod, comments, students, subjects, filteredGrades)
}
```

### Path 2: Breakdown Display (Incorrect)
```typescript
const breakdown = getSubjectCalculationBreakdown(
  previewStudent, 
  subject.subjectId, 
  subjects, 
  grades  // ❌ Using ALL grades, not filtered!
)
```

The breakdown was passing `grades` (all grades) instead of the filtered grades for the selected period.

## Solution

### Step 1: Extract Filtering Logic
Created a reusable helper function `getFilteredGradesForPeriod()`:

```typescript
const getFilteredGradesForPeriod = (): Grade[] => {
  if (markerErrors.length > 0) return []
  
  // Get period index from reportPeriod (e.g., 'sw1' -> 1, 'q2' -> 2, etc.)
  const periodMatch = reportPeriod.match(/(\d+)$/)
  const periodIndex = periodMatch ? parseInt(periodMatch[1], 10) : 1
  
  // Filter grades based on markers for each subject
  return grades.filter(grade => {
    if (!grade.subjectId) return false
    
    const range = getLessonRangeForPeriod(grade.subjectId, periodIndex)
    if (!range) return false
    
    // Get the lesson to check its order_index
    const subject = subjects.find(s => s.id === grade.subjectId)
    if (!subject || !subject.lessons) return false
    
    const lesson = subject.lessons.find(l => l.id === grade.lessonId)
    if (!lesson) return false
    
    const orderIndex = (lesson as any).order_index ?? lesson.orderIndex ?? 0
    
    // Check if lesson is in range
    if (range.max === null) {
      return orderIndex >= range.min
    } else {
      return orderIndex >= range.min && orderIndex <= range.max
    }
  })
}
```

### Step 2: Use in Report Generation
```typescript
const generateReportCardForStudent = (studentId: string): ReportCard | null => {
  // ... safety checks ...
  
  // Get filtered grades for the selected period
  const filteredGrades = getFilteredGradesForPeriod()
  
  return generateReportCard(studentId, reportPeriod, comments, students, subjects, filteredGrades)
}
```

### Step 3: Use in Breakdown Display
```typescript
{previewReport.subjects.map(subject => {
  // Use filtered grades for the breakdown calculation
  const filteredGrades = getFilteredGradesForPeriod()
  const breakdown = getSubjectCalculationBreakdown(
    previewStudent, 
    subject.subjectId, 
    subjects, 
    filteredGrades  // ✅ Now using filtered grades!
  )
  // ...
})}
```

## Result
Now both the overall average and the breakdown display use the same filtered grade set:

**Before:**
```
Overall: 93.7% (lessons 26-50)
Breakdown: 92.5% (all lessons 1-90)  ❌ Mismatch!
```

**After:**
```
Overall: 93.7% (lessons 26-50)
Breakdown: 93.7% (lessons 26-50)  ✅ Matches!
```

## Benefits

### 1. **Consistency**
Both displays now use the exact same filtered grade set, ensuring the numbers always match.

### 2. **Code Reuse**
The filtering logic is defined once and used in multiple places, following DRY principle.

### 3. **Maintainability**
If the filtering logic needs to change, it only needs to be updated in one place.

### 4. **Accuracy**
The breakdown now correctly shows only the grades that contribute to the reported average.

## Example Scenarios

### Scenario 1: First Six Weeks (Period 1)
**Setup:**
- Marker 1 at lesson 25
- Lessons 1-25 have 12 grades, average: 91%
- Lessons 26-50 have 8 grades, average: 95%

**Display:**
```
Overall: 91.0%
Grade Calculation:
Lesson:
91.0% (Weight: 34%)
Grades: 90, 88, 93, 92, 89, 90, 91, 94, 90, 88, 93, 91 → Avg: 91.0%  ✅
```

### Scenario 2: Second Six Weeks (Period 2)
**Setup:**
- Marker 1 at lesson 25, Marker 2 at lesson 50
- Switching to Period 2

**Display:**
```
Overall: 95.0%
Grade Calculation:
Lesson:
95.0% (Weight: 34%)
Grades: 96, 94, 97, 95, 93, 96, 98, 91 → Avg: 95.0%  ✅
```

## Files Modified
- `src/components/Reports.tsx`:
  - Lines 263-295: Added `getFilteredGradesForPeriod()` helper function
  - Lines 297-318: Simplified `generateReportCardForStudent()` to use helper
  - Lines 912-914: Updated breakdown calculation to use filtered grades

## Testing Checklist
✅ Overall percentage matches breakdown calculation for Period 1
✅ Overall percentage matches breakdown calculation for Period 2
✅ Overall percentage matches breakdown calculation for last period
✅ Breakdown shows only grades from lessons within period range
✅ Adding marker and switching periods updates breakdown correctly
✅ Different subjects with different marker positions calculate independently

## Technical Notes

### Why Extract to Helper Function?
**Option A: Pass filtered grades as parameter (Not chosen)**
```typescript
const previewReport = useMemo(() => {
  const filtered = getFilteredGrades()
  return { report: generateReport(), filtered }
}, [...])
```
**Downside**: Would need to restructure useMemo and return value

**Option B: Extract to reusable function (Chosen)**
```typescript
const getFilteredGradesForPeriod = () => { /* filtering logic */ }
// Use wherever needed
```
**Advantages**: 
- Simple to call from any location
- No need to restructure existing code
- Clear separation of concerns
- Easy to test independently

### Performance Considerations
The `getFilteredGradesForPeriod()` function is called twice:
1. Once for report generation
2. Once for each subject in the breakdown display

This is acceptable because:
- The function is fast (array filtering with O(n) complexity)
- Typically < 1000 grades total
- Results in cleaner, more maintainable code
- Could be optimized with useMemo if needed (but not necessary)

### Alternative Considered: Memoization
```typescript
const filteredGrades = useMemo(() => getFilteredGradesForPeriod(), [
  reportPeriod, grades.length, /* ... */
])
```

**Why not implemented:**
- Adds complexity with dependencies
- Function is already fast enough
- Would need to be in scope for both usages
- Current solution is simpler and sufficient

## Related Fixes
This complements:
1. **Infinite Loop Fix**: Using useMemo properly with stable dependencies
2. **Preview Calculation Fix**: Added proper dependencies to trigger recalculation
3. **Marker-Based Filtering**: Core filtering logic based on order_index ranges

Together, these ensure the Reports page is consistent, accurate, and performant.
