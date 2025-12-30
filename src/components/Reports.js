import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Eye, Users, FilePdf, Gear } from "@phosphor-icons/react";
import { getLetterGrade, generateReportCard, getSubjectCalculationBreakdown } from '@/lib/reportUtils';
import { toast } from 'sonner';
import { pdf } from '@react-pdf/renderer';
import ReportCardPDF from './ReportCardPDF';
import { apiClient } from '@/lib/api';
export default function Reports() {
    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [studentGroups, setStudentGroups] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [grades, setGrades] = useState([]);
    const [subjectMarkers, setSubjectMarkers] = useState({});
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [reportPeriod, setReportPeriod] = useState("");
    const [includeComments, setIncludeComments] = useState(true);
    const [showPercentage, setShowPercentage] = useState(true); // Default to percentage instead of GPA
    const [comments, setComments] = useState({});
    const [previewStudent, setPreviewStudent] = useState("");
    const [showCalculationDetails, setShowCalculationDetails] = useState(false);
    const [schoolSettings, setSchoolSettings] = useState({
        schoolName: '',
        firstDayOfSchool: '',
        gradingPeriods: 6
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    // Helper function to extract grade number from group name for sorting
    const extractGradeNumber = (groupName) => {
        const match = groupName.match(/Grade\s+(\d+)/i);
        return match ? parseInt(match[1], 10) : 999; // Put non-grade groups at the end
    };
    // Helper function to get the first group from a student's group_name
    const getFirstGroup = (groupName) => {
        if (!groupName)
            return 'No Group';
        return groupName.split(',')[0].trim();
    };
    // Helper function to group and sort students by their first group
    const groupAndSortStudents = (students) => {
        // Group students by their first group
        const grouped = students.reduce((acc, student) => {
            const firstGroup = getFirstGroup(student.group_name);
            if (!acc[firstGroup]) {
                acc[firstGroup] = [];
            }
            acc[firstGroup].push(student);
            return acc;
        }, {});
        // Sort groups by grade number, then alphabetically
        const sortedGroupNames = Object.keys(grouped).sort((a, b) => {
            const gradeA = extractGradeNumber(a);
            const gradeB = extractGradeNumber(b);
            // If both are grades, sort numerically
            if (gradeA !== 999 && gradeB !== 999) {
                return gradeA - gradeB;
            }
            // If one is a grade and one isn't, put grade first
            if (gradeA !== 999 && gradeB === 999)
                return -1;
            if (gradeA === 999 && gradeB !== 999)
                return 1;
            // If neither are grades, sort alphabetically
            return a.localeCompare(b);
        });
        // Return sorted groups with their students (also sorted by name)
        return sortedGroupNames.map(groupName => ({
            groupName,
            students: grouped[groupName].sort((a, b) => a.name.localeCompare(b.name))
        }));
    };
    const filterDataByTeacherGroups = useCallback(() => {
        const selectedGroupIds = window.SELECTED_TEACHER_GROUPS;
        // Don't filter if we don't have student groups data yet
        if (studentGroups.length === 0) {
            return;
        }
        if (!selectedGroupIds || selectedGroupIds.length === 0) {
            // If no teacher selected or no groups, show all data
            setFilteredStudents(students);
            return;
        }
        // Filter students by their group membership
        const filtered = students.filter(student => {
            if (!student.group_name)
                return false;
            // Parse student's group names and check if any match selected teacher's groups
            const studentGroupNames = student.group_name.split(',').map(g => g.trim());
            const teacherGroupNames = studentGroups
                .filter(group => selectedGroupIds.includes(group.id))
                .map(group => group.name);
            return studentGroupNames.some(studentGroup => teacherGroupNames.includes(studentGroup));
        });
        setFilteredStudents(filtered);
    }, [students, studentGroups]);
    // Compute marker validation errors using useMemo to avoid infinite loops
    const markerErrors = useMemo(() => {
        if (!reportPeriod || subjects.length === 0)
            return [];
        const periodMatch = reportPeriod.match(/(\d+)$/);
        const periodIndex = periodMatch ? parseInt(periodMatch[1], 10) : 1;
        const errors = [];
        const subjectsWithGrades = new Set(grades.map(g => g.subjectId).filter((id) => Boolean(id)));
        subjectsWithGrades.forEach(subjectId => {
            const subject = subjects.find(s => s.id === subjectId);
            if (!subject)
                return;
            const markers = subjectMarkers[subjectId] || [];
            const requiredMarkers = periodIndex === 1 ? 1 : periodIndex - 1;
            if (markers.length < requiredMarkers) {
                errors.push({
                    subjectId: subject.id,
                    subjectName: subject.name,
                    message: `${subject.name} needs at least ${requiredMarkers} marker(s) for this reporting period`
                });
            }
        });
        return errors;
    }, [reportPeriod, subjects.length, grades.length, Object.keys(subjectMarkers).length]);
    // Load all data from API
    useEffect(() => {
        loadData();
    }, []);
    // Filter data when teacher selection changes or data is updated
    useEffect(() => {
        filterDataByTeacherGroups();
    }, [filterDataByTeacherGroups]);
    // Listen for teacher selection changes
    useEffect(() => {
        const handleTeacherChange = () => {
            filterDataByTeacherGroups();
        };
        window.addEventListener('teacher-selection-changed', handleTeacherChange);
        return () => {
            window.removeEventListener('teacher-selection-changed', handleTeacherChange);
        };
    }, [filterDataByTeacherGroups]);
    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load all data in parallel
            const [studentsRes, subjectsRes, gradesRes, groupsRes] = await Promise.all([
                apiClient.getStudents(),
                apiClient.getSubjects(),
                apiClient.getGrades(),
                apiClient.getStudentGroups()
            ]);
            const studentsData = Array.isArray(studentsRes.data) ? studentsRes.data : [];
            const subjectsData = Array.isArray(subjectsRes.data) ? subjectsRes.data : [];
            const gradesData = Array.isArray(gradesRes.data) ? gradesRes.data : [];
            const rawGroups = Array.isArray(groupsRes.data)
                ? groupsRes.data
                : groupsRes.data?.groups || [];
            setStudents(studentsData);
            setGrades(gradesData);
            // Deduplicate groups by ID to prevent React key conflicts
            const uniqueGroups = rawGroups.filter((group, index, self) => index === self.findIndex((g) => g.id === group.id));
            setStudentGroups(uniqueGroups);
            // Load lessons and markers for each subject
            const subjectsWithLessons = await Promise.all(subjectsData.map(async (subject) => {
                try {
                    const [lessonsRes, markersRes] = await Promise.all([
                        apiClient.getLessonsForSubject(subject.id),
                        apiClient.getGradingPeriodMarkersForSubject(subject.id)
                    ]);
                    const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
                    const markers = Array.isArray(markersRes.data) ? markersRes.data : [];
                    // Store markers separately
                    setSubjectMarkers(prev => ({ ...prev, [subject.id]: markers }));
                    return { ...subject, lessons };
                }
                catch (error) {
                    console.warn(`Failed to load lessons/markers for subject ${subject.name}:`, error);
                    return { ...subject, lessons: [] };
                }
            }));
            setSubjects(subjectsWithLessons);
            // Also load settings
            await loadSettings();
        }
        catch (error) {
            console.error('Failed to load data:', error);
            toast.error('Failed to load data');
        }
        finally {
            setIsLoading(false);
        }
    };
    const loadSettings = async () => {
        try {
            const response = await apiClient.getProfile();
            if (response.data) {
                const user = response.data;
                // Format date for HTML input (YYYY-MM-DD)
                const formattedDate = user.first_day_of_school
                    ? new Date(user.first_day_of_school).toISOString().split('T')[0]
                    : '';
                setSchoolSettings({
                    schoolName: user.school_name || 'School Name',
                    firstDayOfSchool: formattedDate,
                    gradingPeriods: user.grading_periods || 6
                });
                // Auto-select current reporting period
                const currentPeriod = getCurrentReportingPeriod(formattedDate, user.grading_periods || 6);
                setReportPeriod(currentPeriod);
            }
        }
        catch (error) {
            console.error('Failed to load settings:', error);
        }
    };
    // Calculate current reporting period based on today's date and first day of school
    const getCurrentReportingPeriod = (firstDayOfSchool, gradingPeriods) => {
        if (!firstDayOfSchool)
            return getReportingPeriodOptions(gradingPeriods)[0]?.value || '';
        const schoolStart = new Date(firstDayOfSchool);
        const today = new Date();
        const daysDiff = Math.floor((today.getTime() - schoolStart.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0)
            return getReportingPeriodOptions(gradingPeriods)[0]?.value || '';
        let periodLength;
        switch (gradingPeriods) {
            case 3: // Trimesters
                periodLength = 120; // ~4 months
                break;
            case 4: // Quarters  
                periodLength = 90; // ~3 months
                break;
            case 6: // Six weeks
                periodLength = 42; // 6 weeks
                break;
            default:
                periodLength = 42;
        }
        const currentPeriod = Math.floor(daysDiff / periodLength) + 1;
        const maxPeriod = gradingPeriods;
        const safePeriod = Math.min(Math.max(currentPeriod, 1), maxPeriod);
        const options = getReportingPeriodOptions(gradingPeriods);
        return options[safePeriod - 1]?.value || options[0]?.value || '';
    };
    // Generate reporting period options based on grading periods setting
    const getReportingPeriodOptions = (gradingPeriods) => {
        switch (gradingPeriods) {
            case 3:
                return [
                    { value: 't1', label: '1st Trimester' },
                    { value: 't2', label: '2nd Trimester' },
                    { value: 't3', label: '3rd Trimester' }
                ];
            case 4:
                return [
                    { value: 'q1', label: '1st Quarter' },
                    { value: 'q2', label: '2nd Quarter' },
                    { value: 'q3', label: '3rd Quarter' },
                    { value: 'q4', label: '4th Quarter' }
                ];
            case 6:
                return [
                    { value: 'sw1', label: '1st Six Weeks' },
                    { value: 'sw2', label: '2nd Six Weeks' },
                    { value: 'sw3', label: '3rd Six Weeks' },
                    { value: 'sw4', label: '4th Six Weeks' },
                    { value: 'sw5', label: '5th Six Weeks' },
                    { value: 'sw6', label: '6th Six Weeks' }
                ];
            default:
                return [{ value: 'current', label: 'Current Period' }];
        }
    };
    const goToSettings = () => {
        // Navigate to Admin tab first
        window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab: 'admin' } }));
        // Then select the Settings tab within Admin after a brief delay
        setTimeout(() => {
            window?.dispatchEvent(new CustomEvent('gradeflow-admin-goto-settings'));
        }, 100);
    };
    const goToSubjectAndAddMarker = (subjectId) => {
        // Navigate to Subjects tab
        window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab: 'subjects' } }));
        // After a brief delay, expand the subject and highlight the add marker button
        setTimeout(() => {
            window?.dispatchEvent(new CustomEvent('gradeflow-subjects-expand-and-highlight', {
                detail: { subjectId, action: 'add-marker' }
            }));
        }, 100);
    };
    // Get lesson order_index range based on report period and markers
    const getLessonRangeForPeriod = (subjectId, periodIndex) => {
        const markers = subjectMarkers[subjectId] || [];
        // Sort markers by order_index
        const sortedMarkers = [...markers].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        // Period 1: From start (1) to first marker
        if (periodIndex === 1) {
            if (sortedMarkers.length === 0) {
                return null; // No markers defined
            }
            return {
                min: 1,
                max: sortedMarkers[0].order_index
            };
        }
        // Last period: From last marker onwards
        if (periodIndex > sortedMarkers.length) {
            if (sortedMarkers.length === 0) {
                return null; // No markers defined
            }
            return {
                min: sortedMarkers[sortedMarkers.length - 1].order_index + 1,
                max: null // No upper limit
            };
        }
        // Middle periods: Between two markers
        if (periodIndex > 1 && periodIndex <= sortedMarkers.length) {
            const startMarkerIndex = periodIndex - 2; // Previous marker
            const endMarkerIndex = periodIndex - 1; // Current marker
            return {
                min: sortedMarkers[startMarkerIndex].order_index + 1,
                max: sortedMarkers[endMarkerIndex].order_index
            };
        }
        return null;
    };
    // Helper function to filter grades based on markers for the selected reporting period
    const getFilteredGradesForPeriod = () => {
        if (markerErrors.length > 0)
            return [];
        // Get period index from reportPeriod (e.g., 'sw1' -> 1, 'q2' -> 2, etc.)
        const periodMatch = reportPeriod.match(/(\d+)$/);
        const periodIndex = periodMatch ? parseInt(periodMatch[1], 10) : 1;
        // Filter grades based on markers for each subject
        return grades.filter(grade => {
            if (!grade.subjectId)
                return false;
            const range = getLessonRangeForPeriod(grade.subjectId, periodIndex);
            if (!range)
                return false; // Skip if no valid range
            // Get the lesson to check its order_index
            const subject = subjects.find(s => s.id === grade.subjectId);
            if (!subject || !subject.lessons)
                return false;
            const lesson = subject.lessons.find(l => l.id === grade.lessonId);
            if (!lesson)
                return false;
            const orderIndex = lesson.order_index ?? lesson.orderIndex ?? 0;
            // Check if lesson is in range
            if (range.max === null) {
                return orderIndex >= range.min;
            }
            else {
                return orderIndex >= range.min && orderIndex <= range.max;
            }
        });
    };
    const generateReportCardForStudent = (studentId) => {
        try {
            // Safety check to ensure all data is loaded
            if (!students.length || !subjects.length || !grades.length) {
                console.warn('generateReportCardForStudent: Missing required data', {
                    students: students.length,
                    subjects: subjects.length,
                    grades: grades.length
                });
                return null;
            }
            // Check if there are marker validation errors
            if (markerErrors.length > 0) {
                console.warn('Marker validation errors:', markerErrors);
                return null;
            }
            // Get filtered grades for the selected period
            const filteredGrades = getFilteredGradesForPeriod();
            return generateReportCard(studentId, reportPeriod, comments, students, subjects, filteredGrades);
        }
        catch (error) {
            console.error('Error generating report card for student:', studentId, error);
            return null;
        }
    };
    const toggleStudent = (studentId) => {
        setSelectedStudents(current => current.includes(studentId)
            ? current.filter(id => id !== studentId)
            : [...current, studentId]);
    };
    const selectAllStudents = () => {
        setSelectedStudents(filteredStudents.map(s => s.id));
    };
    const clearSelection = () => {
        setSelectedStudents([]);
    };
    const generateReports = async () => {
        if (selectedStudents.length === 0) {
            toast.error("Please select at least one student");
            return;
        }
        setIsGenerating(true);
        try {
            // First, let's validate our data without generating PDFs
            const reportCards = selectedStudents
                .map(studentId => {
                try {
                    return generateReportCardForStudent(studentId);
                }
                catch (error) {
                    console.error(`Error generating report for student ${studentId}:`, error);
                    return null;
                }
            })
                .filter(Boolean);
            if (reportCards.length === 0) {
                toast.error("No grades found for selected students");
                setIsGenerating(false);
                return;
            }
            console.log('Report cards generated:', reportCards);
            // Generate individual PDFs for each student
            if (reportCards.length === 1) {
                // Single student - direct download
                const reportCard = reportCards[0];
                const student = students.find(s => s.id === reportCard.studentId);
                // Validate data before creating PDF
                if (!reportCard.subjects || reportCard.subjects.length === 0) {
                    toast.error("No subject grades found for this student");
                    setIsGenerating(false);
                    return;
                }
                // Ensure student object is valid
                if (!student || !student.name) {
                    toast.error("Invalid student data");
                    setIsGenerating(false);
                    return;
                }
                // Validate report card data structure
                if (!reportCard.subjects) {
                    toast.error("Report card has no subjects data");
                    setIsGenerating(false);
                    return;
                }
                // Ensure all subject averages are valid numbers
                const validatedReportCard = {
                    ...reportCard,
                    overallGPA: typeof reportCard.overallGPA === 'number' && !isNaN(reportCard.overallGPA) ? reportCard.overallGPA : 0,
                    subjects: reportCard.subjects.map(subject => ({
                        ...subject,
                        average: typeof subject.average === 'number' && !isNaN(subject.average) ? subject.average : 0
                    }))
                };
                console.log('Validated report card:', validatedReportCard);
                console.log('Student data:', student);
                try {
                    const pdfDoc = _jsx(ReportCardPDF, { reportCard: validatedReportCard, student: student, schoolName: schoolSettings.schoolName, showPercentage: showPercentage });
                    console.log('PDF component created successfully');
                    const asPdf = pdf(pdfDoc);
                    console.log('PDF instance created');
                    const blob = await asPdf.toBlob();
                    console.log('PDF blob generated successfully');
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${student.name.replace(/\s+/g, '_')}_Report_Card_${new Date().toISOString().split('T')[0]}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success(`Generated report card for ${student.name}`);
                }
                catch (pdfError) {
                    console.error('PDF generation error:', pdfError);
                    toast.error(`PDF generation failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`);
                }
            }
            else {
                // Multiple students - generate ZIP file with individual PDFs
                const JSZip = (await import('jszip')).default;
                const zip = new JSZip();
                for (const reportCard of reportCards) {
                    const student = students.find(s => s.id === reportCard.studentId);
                    // Validate data before creating PDF
                    if (!reportCard.subjects || reportCard.subjects.length === 0) {
                        console.warn(`Skipping ${student.name} - no subject grades found`);
                        continue;
                    }
                    // Ensure student object is valid
                    if (!student || !student.name) {
                        console.warn(`Skipping student - invalid data`);
                        continue;
                    }
                    // Validate report card data structure
                    if (!reportCard.subjects) {
                        console.warn(`Skipping ${student.name} - no subjects data`);
                        continue;
                    }
                    // Ensure all subject averages are valid numbers
                    const validatedReportCard = {
                        ...reportCard,
                        overallGPA: typeof reportCard.overallGPA === 'number' && !isNaN(reportCard.overallGPA) ? reportCard.overallGPA : 0,
                        subjects: reportCard.subjects.map(subject => ({
                            ...subject,
                            average: typeof subject.average === 'number' && !isNaN(subject.average) ? subject.average : 0
                        }))
                    };
                    try {
                        const pdfDoc = _jsx(ReportCardPDF, { reportCard: validatedReportCard, student: student, schoolName: schoolSettings.schoolName, showPercentage: showPercentage });
                        const asPdf = pdf(pdfDoc);
                        const blob = await asPdf.toBlob();
                        const fileName = `${student.name.replace(/\s+/g, '_')}_Report_Card.pdf`;
                        zip.file(fileName, blob, { binary: true });
                    }
                    catch (pdfError) {
                        console.error(`Failed to generate PDF for ${student.name}:`, pdfError);
                        toast.error(`Failed to generate PDF for ${student.name}`);
                    }
                }
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Report_Cards_${new Date().toISOString().split('T')[0]}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success(`Generated ${reportCards.length} report cards`);
            }
        }
        catch (error) {
            console.error('Error generating reports:', error);
            // More detailed error handling
            if (error instanceof Error) {
                if (error.message.includes('toFixed')) {
                    toast.error("Data formatting error. Please check that all grades are properly entered.");
                }
                else if (error.message.includes('props')) {
                    toast.error("PDF generation error. Please try again or contact support.");
                }
                else if (error.message.includes('font')) {
                    toast.error("Font loading error in PDF generation. Please try again.");
                }
                else {
                    toast.error(`Failed to generate reports: ${error.message}`);
                }
            }
            else {
                toast.error("Failed to generate reports. Please try again.");
            }
        }
        finally {
            setIsGenerating(false);
        }
    };
    const previewReportPDF = async () => {
        if (!previewStudent) {
            toast.error("Please select a student to preview");
            return;
        }
        let reportCard, student;
        try {
            reportCard = generateReportCardForStudent(previewStudent);
            student = students.find(s => s.id === previewStudent);
            if (!reportCard || !student) {
                toast.error("Unable to generate preview");
                return;
            }
            // Validate data before creating PDF
            if (!reportCard.subjects || reportCard.subjects.length === 0) {
                toast.error("No subject grades found for this student");
                return;
            }
            // Ensure student object is valid
            if (!student || !student.name) {
                toast.error("Invalid student data");
                return;
            }
            // Validate report card data structure
            if (!reportCard.subjects) {
                toast.error("Report card has no subjects data");
                return;
            }
            // Ensure all subject averages are valid numbers
            const validatedReportCard = {
                ...reportCard,
                overallGPA: typeof reportCard.overallGPA === 'number' && !isNaN(reportCard.overallGPA) ? reportCard.overallGPA : 0,
                subjects: reportCard.subjects.map(subject => ({
                    ...subject,
                    average: typeof subject.average === 'number' && !isNaN(subject.average) ? subject.average : 0
                }))
            };
            console.log('Preview - Validated report card:', validatedReportCard);
            console.log('Preview - Student data:', student);
            const pdfDoc = _jsx(ReportCardPDF, { reportCard: validatedReportCard, student: student, schoolName: schoolSettings.schoolName, showPercentage: showPercentage });
            console.log('Preview - PDF component created successfully');
            const asPdf = pdf(pdfDoc);
            console.log('Preview - PDF instance created');
            const blob = await asPdf.toBlob();
            console.log('Preview - PDF blob generated successfully');
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            // Clean up after a delay
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        catch (error) {
            console.error('Error generating preview:', error);
            // More detailed error handling for preview
            if (error instanceof Error) {
                if (error.message.includes('toFixed')) {
                    toast.error("Data formatting error. Please check that all grades are properly entered.");
                }
                else if (error.message.includes('props')) {
                    toast.error("PDF generation error. Please try again or contact support.");
                }
                else if (error.message.includes('font')) {
                    toast.error("Font loading error in PDF generation. Please try again.");
                }
                else {
                    toast.error(`Failed to generate preview: ${error.message}`);
                }
            }
            else {
                toast.error("Failed to generate preview");
            }
        }
    };
    const previewReport = useMemo(() => {
        return previewStudent ? generateReportCardForStudent(previewStudent) : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        previewStudent,
        reportPeriod,
        subjects.length,
        grades.length,
        Object.keys(subjectMarkers).length,
        // Create a stable key from subjects with lessons
        subjects.map(s => `${s.id}:${s.lessons?.length || 0}`).join(',')
    ]);
    const previewStudentData = students.find(s => s.id === previewStudent);
    if (isLoading) {
        return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-bold text-foreground", children: "Reports" }), _jsx("p", { className: "text-muted-foreground", children: "Generate customizable report cards for students" })] }), _jsx("div", { className: "flex justify-center items-center py-12", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" }), _jsx("p", { className: "text-muted-foreground", children: "Loading data..." })] }) })] }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-bold text-foreground", children: "Reports" }), _jsx("p", { className: "text-muted-foreground", children: "Generate customizable report cards for students" })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-3", children: [_jsxs("div", { className: "lg:col-span-2 space-y-6", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Users, { size: 20 }), "Student Selection"] }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: selectAllStudents, children: ["Select All (", filteredStudents.length, ")"] }), _jsx(Button, { variant: "outline", size: "sm", onClick: clearSelection, children: "Clear Selection" }), _jsxs(Badge, { variant: "secondary", children: [selectedStudents.length, " selected"] })] }), filteredStudents.length === 0 ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "No students available" })) : (_jsx("div", { className: "space-y-6", children: groupAndSortStudents(filteredStudents).map(({ groupName, students: groupStudents }) => (_jsxs("div", { children: [_jsx("h4", { className: "text-lg font-semibold mb-3 pb-2 border-b", children: groupName }), _jsx("div", { className: "grid gap-3 md:grid-cols-2", children: groupStudents.map(student => {
                                                                const isSelected = selectedStudents.includes(student.id);
                                                                const hasGrades = grades.some(g => g.studentId === student.id);
                                                                // Calculate subjects for this student from grades
                                                                const studentSubjects = [...new Set(grades
                                                                        .filter(g => g.studentId === student.id)
                                                                        .map(g => g.subjectId))];
                                                                return (_jsxs("div", { className: `flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'bg-primary/5 border-primary' : 'bg-card border-border hover:bg-muted/50'}`, onClick: () => toggleStudent(student.id), children: [_jsx(Checkbox, { checked: isSelected, onCheckedChange: () => toggleStudent(student.id), onClick: (e) => e.stopPropagation() }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-medium truncate", children: student.name }), _jsxs("div", { className: "flex items-center gap-2 mt-1", children: [_jsxs(Badge, { variant: "outline", className: "text-xs", children: [studentSubjects.length, " subjects"] }), hasGrades ? (_jsx(Badge, { variant: "secondary", className: "text-xs", children: "Has grades" })) : (_jsx(Badge, { variant: "destructive", className: "text-xs", children: "No grades" }))] })] })] }, student.id));
                                                            }) })] }, groupName))) }))] })] }), includeComments && (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Teacher Comments" }) }), _jsx(CardContent, { className: "space-y-4", children: selectedStudents.length === 0 ? (_jsx("p", { className: "text-muted-foreground text-sm", children: "Select students to add comments" })) : (_jsx("div", { className: "space-y-4", children: selectedStudents.map(studentId => {
                                                const student = students.find(s => s.id === studentId);
                                                return (_jsxs("div", { children: [_jsx(Label, { htmlFor: `comment-${studentId}`, children: student?.name }), _jsx(Textarea, { id: `comment-${studentId}`, value: comments[studentId] || '', onChange: (e) => setComments(prev => ({
                                                                ...prev,
                                                                [studentId]: e.target.value
                                                            })), placeholder: "Add comments for this student...", className: "mt-1", rows: 3 })] }, studentId));
                                            }) })) })] }))] }), _jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-lg", children: "Report Settings" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { children: "School Name" }), _jsxs("div", { className: "flex items-center gap-2 p-3 border rounded-md bg-gray-50", children: [_jsx("span", { className: "flex-1", children: schoolSettings.schoolName || 'School Name' }), _jsx(Button, { variant: "ghost", size: "sm", onClick: goToSettings, className: "h-8 w-8 p-0", children: _jsx(Gear, { className: "h-4 w-4" }) })] })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "report-period", children: "Reporting Period" }), _jsxs(Select, { value: reportPeriod, onValueChange: setReportPeriod, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: getReportingPeriodOptions(schoolSettings.gradingPeriods).map(option => (_jsx(SelectItem, { value: option.value, children: option.label }, option.value))) })] }), markerErrors.length > 0 && (_jsxs("div", { className: "mt-2 p-3 bg-red-50 border border-red-200 rounded-md", children: [_jsx("p", { className: "text-sm font-medium text-red-800 mb-1", children: "\u26A0\uFE0F Missing Grading Period Markers:" }), _jsx("ul", { className: "text-sm text-red-700 space-y-1", children: markerErrors.map((error, idx) => (_jsxs("li", { className: "flex items-center gap-2", children: [_jsx("span", { children: "\u2022" }), _jsx("span", { children: error.message }), _jsx("button", { onClick: () => goToSubjectAndAddMarker(error.subjectId), className: "text-red-800 underline hover:text-red-900 font-medium text-xs", children: "Add Marker \u2192" })] }, idx))) }), _jsx("p", { className: "text-xs text-red-600 mt-2", children: "Click \"Add Marker \u2192\" to go to the Subjects tab and add the required markers." })] }))] }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Checkbox, { id: "include-comments", checked: includeComments, onCheckedChange: (checked) => setIncludeComments(checked === true) }), _jsx(Label, { htmlFor: "include-comments", children: "Include teacher comments" })] }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Checkbox, { id: "show-percentage", checked: showPercentage, onCheckedChange: (checked) => setShowPercentage(checked === true) }), _jsx(Label, { htmlFor: "show-percentage", children: "Show overall percentage instead of GPA" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs(Button, { onClick: generateReports, className: "w-full", disabled: selectedStudents.length === 0 || isGenerating, children: [_jsx(FilePdf, { size: 16, className: "mr-2" }), isGenerating
                                                                ? `Generating ${selectedStudents.length > 1 ? 'ZIP with ' : ''}${selectedStudents.length} PDF${selectedStudents.length > 1 ? 's' : ''}...`
                                                                : `Generate PDF${selectedStudents.length > 1 ? 's' : ''} (${selectedStudents.length})`] }), selectedStudents.length > 1 && (_jsx("p", { className: "text-xs text-muted-foreground text-center", children: "Multiple reports will be packaged in a ZIP file" }))] })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "text-lg flex items-center gap-2", children: [_jsx(Eye, { size: 18 }), "Preview"] }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "preview-student", children: "Preview Student" }), _jsxs(Select, { value: previewStudent, onValueChange: setPreviewStudent, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select student to preview" }) }), _jsx(SelectContent, { children: filteredStudents.map(student => (_jsx(SelectItem, { value: student.id, children: student.name }, student.id))) })] })] }), previewReport && previewStudentData && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "p-4 border border-border rounded-lg bg-muted/30 space-y-3", children: [_jsxs("div", { className: "text-center border-b border-border pb-3", children: [_jsx("h3", { className: "font-bold text-lg", children: previewStudentData.name }), _jsxs("p", { className: "text-sm text-muted-foreground", children: ["Report Card - ", reportPeriod] }), _jsxs("p", { className: "text-sm font-medium mt-1", children: ["Overall GPA: ", (previewReport.overallGPA ?? 0).toFixed(2), " (", getLetterGrade(previewReport.overallGPA ?? 0), ")"] })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h4", { className: "font-medium text-sm", children: "Subjects" }), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => setShowCalculationDetails(!showCalculationDetails), className: "text-xs h-6 px-2", children: showCalculationDetails ? 'Hide Details' : 'Show Calculation' })] }), previewReport.subjects.map(subject => {
                                                                        // Use filtered grades for the breakdown calculation
                                                                        const filteredGrades = getFilteredGradesForPeriod();
                                                                        const breakdown = getSubjectCalculationBreakdown(previewStudent, subject.subjectId, subjects, filteredGrades);
                                                                        return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex justify-between items-center text-sm", children: [_jsx("span", { children: subject.subjectName }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Badge, { variant: (subject.average ?? 0) >= 90 ? "default" : (subject.average ?? 0) >= 70 ? "secondary" : "destructive", children: subject.letterGrade }), _jsxs("span", { className: "text-muted-foreground", children: [(subject.average ?? 0).toFixed(1), "%"] })] })] }), showCalculationDetails && breakdown && (_jsxs("div", { className: "ml-4 p-3 bg-muted/50 rounded-md space-y-2 text-xs", children: [_jsx("div", { className: "font-medium", children: "Grade Calculation:" }), breakdown.categories.map((category, idx) => (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsxs("span", { className: "font-medium", children: [category.categoryName, ":"] }), _jsxs("span", { children: [category.average.toFixed(1), "% (Weight: ", (category.weight * 100).toFixed(0), "%)"] })] }), _jsxs("div", { className: "text-muted-foreground ml-2", children: ["Grades: ", category.grades.map(g => g.toFixed(0)).join(', '), category.grades.length > 1 && ` → Avg: ${category.average.toFixed(1)}%`] }), _jsxs("div", { className: "text-muted-foreground ml-2", children: ["Weighted: ", category.average.toFixed(1), "% \u00D7 ", (category.weight * 100).toFixed(0), "% = ", category.weightedValue.toFixed(1)] })] }, idx))), _jsx("div", { className: "pt-2 border-t border-border", children: _jsxs("div", { className: "font-medium", children: ["Final: ", breakdown.categories.map(c => c.weightedValue.toFixed(1)).join(' + '), "\u00F7 ", (breakdown.categories.reduce((sum, c) => sum + c.weight, 0) * 100).toFixed(0), "% = ", breakdown.finalAverage.toFixed(1), "%"] }) })] }))] }, subject.subjectId));
                                                                    })] }), includeComments && comments[previewStudent] && (_jsxs("div", { className: "space-y-2", children: [_jsx("h4", { className: "font-medium text-sm", children: "Teacher Comments" }), _jsx("p", { className: "text-sm text-muted-foreground", children: comments[previewStudent] })] }))] }), _jsxs(Button, { onClick: previewReportPDF, variant: "outline", className: "w-full", size: "sm", children: [_jsx(Eye, { size: 16, className: "mr-2" }), "Preview PDF Report"] })] }))] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-lg", children: "Grading Scale" }) }), _jsx(CardContent, { children: _jsxs("div", { className: "space-y-1 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "A+ (97-100%)" }), _jsx("span", { children: "4.0" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "A (93-96%)" }), _jsx("span", { children: "4.0" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "A- (90-92%)" }), _jsx("span", { children: "3.7" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "B+ (87-89%)" }), _jsx("span", { children: "3.3" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "B (83-86%)" }), _jsx("span", { children: "3.0" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "B- (80-82%)" }), _jsx("span", { children: "2.7" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "C+ (77-79%)" }), _jsx("span", { children: "2.3" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "C (73-76%)" }), _jsx("span", { children: "2.0" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "C- (70-72%)" }), _jsx("span", { children: "1.7" })] }), _jsxs("div", { className: "flex justify-between text-destructive", children: [_jsx("span", { children: "F (0-59%)" }), _jsx("span", { children: "0.0" })] })] }) })] })] })] })] }));
}
