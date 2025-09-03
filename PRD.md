# Teacher Grade Management System

A comprehensive web application that enables teachers to efficiently manage student grades, create customizable report cards, and analyze academic performance trends across classes and individual students.

**Experience Qualities**: 
1. **Efficient** - Streamlined grade entry with keyboard shortcuts and bulk operations that save teachers valuable time
2. **Comprehensive** - Complete academic management from subject setup to detailed analytics and report generation
3. **Intuitive** - Clean, organized interface that reduces cognitive load during busy grading periods

**Complexity Level**: Complex Application (advanced functionality, accounts)
- Requires sophisticated data relationships between students, subjects, lessons, and grades with multi-level analytics and customizable reporting features

## Essential Features

### Subject & Lesson Management
- **Functionality**: Create subjects, define lessons within subjects, set grading weights for different assessment types
- **Purpose**: Establishes the academic structure and grading criteria before student enrollment
- **Trigger**: Teacher accesses "Setup" from main navigation
- **Progression**: Select subject → Add lessons → Define assessment types (homework, quizzes, tests, projects) → Set percentage weights → Save configuration
- **Success criteria**: Teachers can quickly replicate subject structures and modify weights mid-semester

### Student Roster Management
- **Functionality**: Add students to classes, organize into groups, assign to subjects
- **Purpose**: Creates the foundation for all grade tracking and reporting
- **Trigger**: Teacher selects "Students" from main navigation
- **Progression**: Add new student → Assign to class/subjects → Optional group assignment → Bulk import via CSV
- **Success criteria**: 100+ students can be managed efficiently with easy bulk operations

### Rapid Grade Entry
- **Functionality**: Fast keyboard-driven grade input with arrow/tab/enter navigation, mobile touch optimization
- **Purpose**: Minimizes time spent on data entry during heavy grading periods
- **Trigger**: Teacher selects "Grades" and chooses subject/lesson
- **Progression**: Select subject/lesson → Grade entry grid appears → Navigate with arrows/tab → Enter grades → Auto-save → Validation feedback
- **Success criteria**: Teachers can enter 30+ grades in under 2 minutes with zero data loss

### Analytics Dashboard
- **Functionality**: Visual trends for classes, student groups, and individuals with filterable time periods
- **Purpose**: Identifies at-risk students and tracks academic progress patterns
- **Trigger**: Teacher clicks "Dashboard" from main navigation
- **Progression**: View class overview → Filter by time/subject/group → Drill down to individual students → Export insights
- **Success criteria**: Teachers can identify struggling students within 30 seconds of dashboard access

### Customizable Report Cards
- **Functionality**: Generate PDF reports with custom layouts, grade breakdowns, and teacher comments
- **Purpose**: Professional communication tool for parents and administrative records
- **Trigger**: Teacher selects "Reports" and chooses students/time period
- **Progression**: Select students → Choose report template → Customize fields → Add comments → Generate PDF → Email/download
- **Success criteria**: Professional report cards generated in under 5 minutes for entire class

## Edge Case Handling

- **Missing Grades**: Display clear indicators for incomplete assignments with bulk entry options
- **Grade Changes**: Audit trail for all grade modifications with timestamps and reasons
- **Data Validation**: Prevent invalid grades (negative, over maximum) with immediate feedback
- **Network Issues**: Local storage backup with sync when connection restored
- **Bulk Operations**: Undo functionality for accidental mass changes
- **Report Errors**: Graceful handling of missing data with customizable fallback text

## Design Direction

The interface should feel professional and calming - like a high-quality educational tool that reduces stress during busy grading periods, with a clean, organized aesthetic that prioritizes function over decoration while maintaining visual appeal.

## Color Selection

Triadic (three equally spaced colors) - Using educational blues, warm greens, and soft oranges to create a professional yet approachable academic environment that differentiates between data types and status indicators.

- **Primary Color**: Deep Educational Blue (oklch(0.45 0.15 230)) - Communicates trust, professionalism, and academic authority
- **Secondary Colors**: Sage Green (oklch(0.65 0.08 140)) for positive indicators and success states, Warm Orange (oklch(0.68 0.12 45)) for attention and warnings
- **Accent Color**: Bright Orange (oklch(0.72 0.15 45)) - Attention-grabbing highlight for CTAs and important grade alerts
- **Foreground/Background Pairings**: 
  - Background (White oklch(1 0 0)): Dark Gray text (oklch(0.2 0 0)) - Ratio 10.4:1 ✓
  - Card (Light Gray oklch(0.98 0 0)): Dark Gray text (oklch(0.2 0 0)) - Ratio 9.8:1 ✓
  - Primary (Deep Blue oklch(0.45 0.15 230)): White text (oklch(1 0 0)) - Ratio 5.8:1 ✓
  - Secondary (Sage Green oklch(0.65 0.08 140)): White text (oklch(1 0 0)) - Ratio 3.2:1 ✓
  - Accent (Bright Orange oklch(0.72 0.15 45)): White text (oklch(1 0 0)) - Ratio 4.1:1 ✓

## Font Selection

Typography should convey clarity and professionalism while maintaining excellent readability during long grading sessions - Inter for its exceptional legibility at all sizes and numerical clarity.

- **Typographic Hierarchy**: 
  - H1 (Page Titles): Inter Bold/32px/tight letter spacing
  - H2 (Section Headers): Inter SemiBold/24px/normal spacing
  - H3 (Subsections): Inter Medium/18px/normal spacing
  - Body (Interface Text): Inter Regular/16px/relaxed line height
  - Data (Grades/Numbers): Inter Medium/16px/tabular numbers
  - Labels (Form Fields): Inter Medium/14px/uppercase tracking

## Animations

Subtle and purposeful animations that enhance workflow efficiency without distraction - focus on micro-interactions that provide immediate feedback during rapid data entry sessions.

- **Purposeful Meaning**: Smooth transitions communicate successful data saves, form validation states, and navigation context while maintaining focus on the task
- **Hierarchy of Movement**: Grade entry feedback takes priority, followed by navigation transitions, with celebratory animations for completed tasks

## Component Selection

- **Components**: 
  - Tables (shadcn) with custom keyboard navigation for grade entry grids
  - Cards (shadcn) for student/subject overview with custom hover states
  - Forms (shadcn) with react-hook-form integration for all data entry
  - Dialogs (shadcn) for quick actions like adding students/subjects
  - Tabs (shadcn) for dashboard view switching
  - Progress components for completion tracking
  - Charts (recharts) for analytics visualization

- **Customizations**: 
  - Custom DataGrid component for efficient grade entry with keyboard navigation
  - GradeCell component with inline editing and validation
  - StudentCard component with quick-action buttons
  - Custom PDF generation component for report cards

- **States**: 
  - Buttons: Clear primary/secondary hierarchy with loading states for data operations
  - Inputs: Focus states optimized for rapid tabbing, error states with helpful messages
  - Data cells: Hover, edit, saved, and error states with smooth transitions

- **Icon Selection**: 
  - Phosphor icons throughout: GraduationCap for academics, ChartBar for analytics, FileText for reports, Users for students
  - Consistent 20px size for interface, 16px for inline actions

- **Spacing**: 
  - Consistent 4px base unit: 16px for component padding, 24px for section spacing, 8px for inline elements
  - Generous whitespace in grade entry areas to reduce visual fatigue

- **Mobile**: 
  - Mobile-first responsive design with touch-optimized grade entry
  - Collapsible navigation, swipe gestures for quick actions
  - Stack cards vertically, optimize tables for horizontal scroll with sticky columns