# Dashboard Marker-Based Filtering Update

## Overview
Updated the Dashboard component to use marker-based filtering instead of date-based filtering for calculating class averages and identifying at-risk students. This ensures consistency with the Reports component.

## Problem
The Dashboard was using a date-based system to determine grading periods:
- School year started August 15th
- Each period was 42 days (6 weeks)
- Calculated based on days elapsed since school year start

This was inconsistent with:
- Reports component (uses markers)
- Subjects component (uses markers for lesson boundaries)
- The actual grading workflow (markers define period boundaries)

## Solution
Replaced date-based logic with marker-based filtering that matches the Reports component:

### 1. Added Marker State
```typescript
const [subjectMarkers, setSubjectMarkers] = useState<Record<string, any[]>>({})
```

### 2. Added Marker-Based Range Calculation
```typescript
const getLessonRangeForPeriod = (subjectId: string, periodIndex: number): { min: number; max: number | null } | null => {
  const markers = subjectMarkers[subjectId] || []
  const sortedMarkers = [...markers].sort((a, b) => ((a as any).order_index || 0) - ((b as any).order_index || 0))
  
  // Period 1: From start to first marker
  if (periodIndex === 1) {
    if (sortedMarkers.length === 0) return null
    return { min: 1, max: sortedMarkers[0].order_index }
  }
  
  // Last period: After last marker to end
  if (periodIndex > sortedMarkers.length) {
    if (sortedMarkers.length === 0) return null
    return { min: sortedMarkers[sortedMarkers.length - 1].order_index + 1, max: null }
  }
  
  // Middle periods: Between two markers
  if (periodIndex > 1 && periodIndex <= sortedMarkers.length) {
    const startMarkerIndex = periodIndex - 2
    const endMarkerIndex = periodIndex - 1
    return {
      min: sortedMarkers[startMarkerIndex].order_index + 1,
      max: sortedMarkers[endMarkerIndex].order_index
    }
  }
  
  return null
}
```

### 3. Added Grade Filtering Function
```typescript
const getFilteredGradesForPeriod = (periodIndex: number): Grade[] => {
  return grades.filter(grade => {
    if (!grade.subjectId) return false
    
    const range = getLessonRangeForPeriod(grade.subjectId, periodIndex)
    if (!range) return false
    
    const subjectLessons = lessons[grade.subjectId]
    if (!subjectLessons) return false
    
    const lesson = subjectLessons.find(l => l.id === grade.lessonId)
    if (!lesson) return false
    
    const lessonOrderIndex = lesson.order_index || lesson.orderIndex || 0
    
    // Check if lesson is within range
    if (lessonOrderIndex < range.min) return false
    if (range.max !== null && lessonOrderIndex > range.max) return false
    
    return true
  })
}
```

### 4. Updated Data Loading
```typescript
// Fetch lessons and markers for subjects that have grades
const lessonsMap: Record<string, any[]> = {}
const markersMap: Record<string, any[]> = {}

await Promise.all(
  subjectsWithGrades.map(async (subject) => {
    const [lessonsRes, markersRes] = await Promise.all([
      apiClient.getLessonsForSubject(subject.id),
      apiClient.getGradingPeriodMarkersForSubject(subject.id)
    ])
    
    if (Array.isArray(lessonsRes.data)) {
      lessonsMap[subject.id] = lessonsRes.data
    }
    
    if (Array.isArray(markersRes.data)) {
      markersMap[subject.id] = markersRes.data
    }
  })
)

setLessons(lessonsMap)
setSubjectMarkers(markersMap)
```

### 5. Updated Average Calculation
```typescript
// OLD: Date-based filtering
const currentPeriodGrades = grades.filter(grade => {
  const gradeDate = new Date(grade.date)
  return getGradingPeriod(gradeDate) === currentGradingPeriod
})

// NEW: Marker-based filtering
const currentPeriodGrades = getFilteredGradesForPeriod(currentGradingPeriod)
```

## Removed Code

### Date-Based Period Calculation
```typescript
// REMOVED
const getGradingPeriod = (date: Date): number => {
  const schoolYearStart = new Date(date.getFullYear(), 7, 15)
  if (date < schoolYearStart) {
    schoolYearStart.setFullYear(date.getFullYear() - 1)
  }
  const daysDiff = Math.floor((date.getTime() - schoolYearStart.getTime()) / (1000 * 60 * 60 * 24))
  const period = Math.floor(daysDiff / 42) + 1
  return Math.min(Math.max(period, 1), 6)
}

const getCurrentGradingPeriod = (): number => {
  return getGradingPeriod(new Date())
}
```

### Initialization Change
```typescript
// OLD: Set to current date-based period
setCurrentGradingPeriod(getCurrentGradingPeriod())

// NEW: Default to period 1
setCurrentGradingPeriod(1)
```

## Period Range Logic

### Period 1 (First Period)
- **Range:** From first lesson (order_index = 1) to first marker
- **Example:** Lessons 1-10 if marker 1 is at position 10
- **Required Markers:** 1

### Middle Periods
- **Range:** From previous marker + 1 to current marker
- **Example Period 2:** Lessons 11-20 if marker 1 at position 10, marker 2 at position 20
- **Required Markers:** Period index - 1

### Last Period
- **Range:** From last marker + 1 to end (no upper limit)
- **Example:** Lessons 21+ if last marker is at position 20
- **Required Markers:** Equal to number of completed periods

## Behavior Changes

### Before (Date-Based)
1. Dashboard showed "current" period based on today's date
2. Each period was exactly 42 days (6 weeks)
3. Periods were fixed calendar dates
4. No alignment with actual curriculum markers
5. Could show different periods than Reports tab

### After (Marker-Based)
1. Dashboard defaults to Period 1
2. User manually navigates between periods using ← → buttons
3. Periods align with curriculum markers placed by teacher
4. Flexible period lengths based on actual lesson progress
5. **Consistent with Reports tab** - same filtering logic

## UI Components Affected

### Class Average Card
- Still shows period navigation buttons (← →)
- Still displays "X/6" period indicator
- Still shows period name ("1st Six Weeks", etc.)
- **Now uses marker-based filtering** instead of dates
- Shows count of filtered grades: "{count} grades"

### At Risk Card
- Uses same filtered grades as Class Average
- Students identified based on marker-filtered grades only
- Consistent with Reports tab risk assessment

## Data Requirements

### Prerequisites
For accurate calculations, each subject needs:
1. **Lessons** with `order_index` values
2. **Markers** with `order_index` values placed between lessons
3. **Grades** linked to lessons via `lessonId`

### Validation
If a subject lacks required markers:
- `getLessonRangeForPeriod()` returns `null`
- Grades for that subject are excluded from calculations
- No error shown (graceful degradation)
- Consistent with Reports behavior (shows marker errors there)

## Benefits

### 1. **Consistency**
- Dashboard and Reports now use identical filtering
- Same grades counted in both places
- Same "at risk" students identified
- Reduces user confusion

### 2. **Flexibility**
- Periods can be different lengths
- Teachers control boundaries with markers
- Aligns with actual curriculum pacing
- Adapts to school calendar variations

### 3. **Accuracy**
- Grades counted in correct period
- Based on curriculum position, not date
- Handles late/early lessons correctly
- Respects teacher's intent with marker placement

### 4. **Maintainability**
- Single source of truth (markers)
- Reused logic from Reports component
- Easy to update in one place
- Less code duplication

## Testing Scenarios

### Test 1: Period 1 with One Marker
**Setup:**
- Subject has lessons 1-20
- Marker at position 10
- Grades for lessons 1-5

**Expected:**
- Period 1 shows average of lessons 1-10
- Only grades for lessons 1-5 counted (others not yet graded)
- Period 2 shows 0 grades (none yet)

### Test 2: Period 2 Between Markers
**Setup:**
- Marker 1 at position 10
- Marker 2 at position 20
- Grades for lessons 11-15

**Expected:**
- Period 1 shows average of lessons 1-10
- Period 2 shows average of lessons 11-20
- Only grades for lessons 11-15 counted in Period 2

### Test 3: Last Period (No Upper Bound)
**Setup:**
- Marker 1 at position 10
- Marker 2 at position 20
- 30 total lessons
- Grades for lessons 21-30

**Expected:**
- Period 3 shows average of lessons 21-30
- All grades from lesson 21 onward counted
- No upper limit

### Test 4: Missing Markers
**Setup:**
- Subject has no markers
- Multiple grades entered

**Expected:**
- Period 1 returns null range
- No grades counted for that subject
- Class average excludes that subject
- No error displayed (graceful)

### Test 5: Multiple Subjects
**Setup:**
- Subject A: marker at 10, grades 1-5
- Subject B: marker at 15, grades 1-8

**Expected:**
- Period 1 includes grades from both subjects
- Each subject filtered independently
- Combined average calculated correctly

## Migration Notes

### No Data Migration Required
- Existing data works without changes
- Markers already in database from Reports feature
- Lessons already have order_index from Subjects feature
- Grades already linked to lessons

### User Impact
- Users will notice period selection behavior change
- Dashboard no longer "auto-detects" current period
- Must manually navigate to desired period
- More control, less automatic assumptions

### Backwards Compatibility
- Old date-based logic completely removed
- No fallback to date-based calculation
- Requires markers for accurate results
- Consistent with Reports requirements

## Future Enhancements

### Potential Improvements
1. **Auto-detect period:** Use most recent grades to suggest current period
2. **Period summary:** Show date ranges for each period based on marker placement
3. **Missing marker warnings:** Display errors like Reports component
4. **Period comparison:** Side-by-side comparison of multiple periods
5. **Trend analysis:** Show average progression across periods
6. **Sync with Reports:** Clicking "Class Average" navigates to Reports with same period selected

## Related Components

### Components Using Marker-Based Filtering
- **Reports.tsx:** Original implementation
- **Dashboard.tsx:** This update (uses same logic)

### Components Using Markers
- **Subjects.tsx:** Marker placement and management
- **GradeEntry.tsx:** No filtering (shows all lessons)

### Shared Functions
Both Reports and Dashboard now have identical implementations of:
- `getLessonRangeForPeriod()`
- `getFilteredGradesForPeriod()`

**Note:** Consider extracting to shared utility file in future refactoring.

## Files Modified
- `src/components/Dashboard.tsx`

## Related Documentation
- `MARKER_BASED_REPORTS.md` - Original marker-based filtering implementation
- `MARKER_SHIFT_FEATURE.md` - Marker management features
- `MARKER_ERROR_NAVIGATION.md` - Error handling and navigation

## Conclusion
The Dashboard now uses the same marker-based filtering as Reports, ensuring consistency across the application and providing more accurate, curriculum-aligned grade calculations.
