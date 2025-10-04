# Marker-Based Reporting System

## Overview
Updated the Reports page to use grading period markers instead of date-based logic for determining which lessons/grades to include in each reporting period.

## Key Changes

### 1. Data Loading
**File**: `src/components/Reports.tsx`

- Added `subjectMarkers` state to store markers for each subject
- Updated `loadData()` to fetch markers alongside lessons for each subject
- Added `markerErrors` state to display validation errors

```typescript
const [subjectMarkers, setSubjectMarkers] = useState<Record<string, any[]>>({})
const [markerErrors, setMarkerErrors] = useState<string[]>([])
```

### 2. Period-Based Filtering Logic

#### Function: `getLessonRangeForPeriod(subjectId, periodIndex)`
Returns the order_index range for lessons based on the selected reporting period and markers.

**Period 1 (First):**
- Range: From order_index 1 to the first marker
- Example: If first marker is at position 25, includes lessons 1-25

**Period 2-N (Middle Periods):**
- Range: Between two consecutive markers
- Example: Period 2 with markers at 25 and 50 includes lessons 26-50

**Last Period (e.g., Period 3 for 3 trimesters):**
- Range: From last marker onwards (no upper limit)
- Example: If last marker is at position 75, includes lessons 76+

```typescript
const getLessonRangeForPeriod = (subjectId: string, periodIndex: number) => {
  const markers = subjectMarkers[subjectId] || []
  const sortedMarkers = [...markers].sort((a, b) => 
    ((a as any).order_index ?? 0) - ((b as any).order_index ?? 0)
  )
  
  // Period 1: Start to first marker
  if (periodIndex === 1) {
    return { min: 1, max: sortedMarkers[0].order_index }
  }
  
  // Last period: After last marker
  if (periodIndex > sortedMarkers.length) {
    return { min: sortedMarkers[sortedMarkers.length - 1].order_index + 1, max: null }
  }
  
  // Middle periods: Between markers
  return {
    min: sortedMarkers[periodIndex - 2].order_index + 1,
    max: sortedMarkers[periodIndex - 1].order_index
  }
}
```

### 3. Marker Validation

#### Function: `validateMarkers(periodIndex)`
Ensures all subjects with grades have the required number of markers for the selected period.

**Validation Rules:**
- Period 1: Requires at least 1 marker
- Period 2: Requires at least 1 marker (between start and marker 1)
- Period 3: Requires at least 2 markers (between markers 1 and 2)
- Last Period: Uses the last marker as starting point

```typescript
const validateMarkers = (periodIndex: number): string[] => {
  const errors: string[] = []
  const subjectsWithGrades = new Set(grades.map(g => g.subjectId).filter(Boolean))
  
  subjectsWithGrades.forEach(subjectId => {
    const subject = subjects.find(s => s.id === subjectId)
    const markers = subjectMarkers[subjectId] || []
    const requiredMarkers = periodIndex === 1 ? 1 : periodIndex - 1
    
    if (markers.length < requiredMarkers) {
      errors.push(`${subject.name} needs at least ${requiredMarkers} marker(s)`)
    }
  })
  
  return errors
}
```

### 4. Grade Filtering

#### Updated: `generateReportCardForStudent(studentId)`
Now filters grades based on lesson order_index and marker positions:

1. Extracts period index from reportPeriod (e.g., 'sw1' → 1, 'q2' → 2)
2. Validates that all subjects have required markers
3. Filters grades to only include those within the period's order_index range
4. Displays validation errors if markers are missing

```typescript
// Get period index
const periodMatch = reportPeriod.match(/(\d+)$/)
const periodIndex = periodMatch ? parseInt(periodMatch[1], 10) : 1

// Validate markers
const errors = validateMarkers(periodIndex)
if (errors.length > 0) {
  setMarkerErrors(errors)
  return null
}

// Filter grades based on order_index ranges
const filteredGrades = grades.filter(grade => {
  if (!grade.subjectId) return false
  
  const range = getLessonRangeForPeriod(grade.subjectId, periodIndex)
  if (!range) return false
  
  const subject = subjects.find(s => s.id === grade.subjectId)
  const lesson = subject?.lessons?.find(l => l.id === grade.lessonId)
  const orderIndex = (lesson as any).order_index ?? lesson?.orderIndex ?? 0
  
  // Check if in range
  if (range.max === null) {
    return orderIndex >= range.min
  } else {
    return orderIndex >= range.min && orderIndex <= range.max
  }
})
```

### 5. User Interface

#### Error Display
Added visual feedback below the Reporting Period selector:

```tsx
{markerErrors.length > 0 && (
  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
    <p className="text-sm font-medium text-red-800 mb-1">
      ⚠️ Missing Grading Period Markers:
    </p>
    <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
      {markerErrors.map((error, idx) => (
        <li key={idx}>{error}</li>
      ))}
    </ul>
    <p className="text-xs text-red-600 mt-2">
      Please add the required markers in the Subjects tab before generating reports.
    </p>
  </div>
)}
```

#### Real-time Validation
Added useEffect to validate markers whenever:
- Report period changes
- Subjects data updates
- Grades data updates
- Markers data updates

## Examples

### Example 1: Three Trimesters
**Setup:**
- Subject: Math
- Lessons: 90 total
- Marker 1: After lesson 30 (order_index: 30)
- Marker 2: After lesson 60 (order_index: 60)

**Report Periods:**
- **1st Trimester**: Lessons 1-30
- **2nd Trimester**: Lessons 31-60
- **3rd Trimester**: Lessons 61-90

### Example 2: Four Quarters
**Setup:**
- Subject: Science
- Lessons: 80 total
- Marker 1: After lesson 20 (order_index: 20)
- Marker 2: After lesson 40 (order_index: 40)
- Marker 3: After lesson 60 (order_index: 60)

**Report Periods:**
- **1st Quarter**: Lessons 1-20
- **2nd Quarter**: Lessons 21-40
- **3rd Quarter**: Lessons 41-60
- **4th Quarter**: Lessons 61-80

### Example 3: Six Six-Weeks
**Setup:**
- Subject: English
- Lessons: 120 total
- Markers at: 20, 40, 60, 80, 100

**Report Periods:**
- **1st Six Weeks**: Lessons 1-20
- **2nd Six Weeks**: Lessons 21-40
- **3rd Six Weeks**: Lessons 41-60
- **4th Six Weeks**: Lessons 61-80
- **5th Six Weeks**: Lessons 81-100
- **6th Six Weeks**: Lessons 101-120

## Benefits Over Date-Based System

### 1. **Flexibility**
- Teachers can place markers wherever appropriate
- Not tied to fixed calendar dates
- Accommodates different pacing for different subjects

### 2. **Accuracy**
- Grades are included based on actual lesson sequence
- No confusion about which grading period a lesson belongs to
- Handles holidays, breaks, and schedule variations naturally

### 3. **Visual Clarity**
- Markers visible in the Subjects tab show clear boundaries
- Teachers can see exactly which lessons are in each period
- Easy to adjust markers if needed (using up/down arrows)

### 4. **Consistency**
- Same marker system used for both grade entry and reporting
- No discrepancies between what's taught and what's reported
- Works identically across all subjects regardless of scheduling

### 5. **Error Prevention**
- Validation ensures markers are placed before generating reports
- Clear error messages guide teachers to fix issues
- Prevents generating incomplete or incorrect reports

## Migration Notes

### From Date-Based to Marker-Based
1. **Removed date calculations**: No longer uses `first_day_of_school` or day counting
2. **Removed grading period auto-detection**: Teachers explicitly place markers
3. **Simplified logic**: No complex date math or timezone issues

### Backward Compatibility
- System still supports the `grading_periods` setting (3, 4, or 6)
- This determines the number of reporting period options
- Teachers must add markers to use the new system

## Files Modified
- `src/components/Reports.tsx`:
  - Lines 21-22: Added `subjectMarkers` and `markerErrors` state
  - Lines 44-50: Added marker validation useEffect
  - Lines 62-79: Updated `loadData` to fetch markers
  - Lines 195-240: Added `getLessonRangeForPeriod` function
  - Lines 241-260: Added `validateMarkers` function
  - Lines 262-323: Updated `generateReportCardForStudent` with filtering
  - Lines 772-786: Added marker error display UI

## Testing Checklist
✅ First period includes lessons from start to first marker
✅ Middle periods include lessons between consecutive markers
✅ Last period includes lessons after last marker onwards
✅ Validation errors display when markers are missing
✅ Validation clears when markers are added
✅ Grade calculation uses only filtered lessons
✅ Report PDF shows correct period label
✅ Works with 3, 4, and 6 period configurations
✅ Handles subjects with different numbers of lessons
✅ Gracefully handles subjects without markers (shows error)

## Future Enhancements
- Add "Quick Setup" button to auto-place markers evenly
- Show period boundaries visually in Subjects tab
- Allow copying marker positions across subjects
- Add marker templates (e.g., "Standard 6-week intervals")
- Export/import marker configurations
