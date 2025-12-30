import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, X, Keyboard, Percent, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { toast } from 'sonner';
// Helper function to round percentage to nearest 0.5%
const roundToNearestHalf = (percentage) => {
    return Math.round(percentage * 2) / 2;
};
// Helper function to format percentage with proper decimal places
const formatPercentage = (percentage) => {
    // If it's a whole number, show without decimal
    if (percentage % 1 === 0) {
        return percentage.toString();
    }
    // Otherwise, show one decimal place
    return percentage.toFixed(1);
};
export default function GradeEntry() {
    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [filteredSubjects, setFilteredSubjects] = useState([]);
    const [studentGroups, setStudentGroups] = useState([]);
    const [grades, setGrades] = useState([]);
    const [gradeCategoryTypes, setGradeCategoryTypes] = useState([]);
    const [loadingInitialData, setLoadingInitialData] = useState(true);
    // Refactor to use normalized table system
    useEffect(() => {
        async function fetchData() {
            try {
                setLoadingInitialData(true);
                const studentsRes = await apiClient.getStudents();
                setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
                const subjectsRes = await apiClient.getSubjects();
                setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : []);
                const studentGroupsRes = await apiClient.getStudentGroups();
                setStudentGroups(Array.isArray(studentGroupsRes.data) ? studentGroupsRes.data : []);
                const gradesRes = await apiClient.getGrades();
                if (gradesRes.error) {
                    toast.error(`Failed to fetch grades: ${gradesRes.error}`);
                }
                else {
                    setGrades(Array.isArray(gradesRes.data) ? gradesRes.data : []);
                }
                // Load grade category types for styling
                const categoryTypesRes = await apiClient.getGradeCategoryTypes();
                if (categoryTypesRes.data) {
                    setGradeCategoryTypes(Array.isArray(categoryTypesRes.data) ? categoryTypesRes.data : []);
                }
            }
            catch (error) {
                toast.error('An unexpected error occurred while fetching data.');
                console.error(error);
            }
            finally {
                setLoadingInitialData(false);
            }
        }
        fetchData();
    }, []);
    const [selectedSubjectId, setSelectedSubjectId] = useState(() => {
        return localStorage.getItem('gradeflow-selectedSubjectId') || "";
    });
    const [selectedLessonId, setSelectedLessonId] = useState(() => {
        return localStorage.getItem('gradeflow-selectedLessonId') || "";
    });
    const [gradeValues, setGradeValues] = useState({});
    const [focusedCell, setFocusedCell] = useState(null);
    const [entryMode, setEntryMode] = useState('percentage');
    const [activeView, setActiveView] = useState('entry');
    const [lessonPoints, setLessonPoints] = useState("");
    // Helper function to check if a lesson type is default (doesn't need special styling)
    const isDefaultLessonType = (lessonType) => {
        const categoryType = gradeCategoryTypes.find(cat => cat.name === lessonType);
        return categoryType?.is_default || false;
    };
    // Helper function to get categoryId from type name
    const getCategoryIdFromTypeName = (typeName) => {
        const categoryType = gradeCategoryTypes.find(cat => cat.name === typeName);
        return categoryType?.id;
    };
    // Helper function to get category color from type name or lesson data
    const getCategoryColor = (lesson) => {
        // First try to use the type_color field from the API response
        if (lesson.type_color) {
            return lesson.type_color;
        }
        // Fallback to looking up by type name
        const categoryType = gradeCategoryTypes.find(cat => cat.name === lesson.type);
        return categoryType?.color || '#6366f1'; // Default color
    };
    const gridRef = useRef(null);
    const inputRefs = useRef({});
    const lessonPointsRef = useRef(null);
    // Inline editing state
    const [editingCell, setEditingCell] = useState(null);
    const [editingLesson, setEditingLesson] = useState(null);
    const [lessonEditFocusOnPoints, setLessonEditFocusOnPoints] = useState(false);
    const [tempGradeValue, setTempGradeValue] = useState("");
    const [tempLessonData, setTempLessonData] = useState({});
    const [subjectLessons, setSubjectLessons] = useState({});
    const [loadingLessons, setLoadingLessons] = useState({});
    const [subjectSelectOpen, setSubjectSelectOpen] = useState(false);
    const [shouldFocusFirstStudent, setShouldFocusFirstStudent] = useState(false);
    // Lesson editing state
    const [editLessonDialog, setEditLessonDialog] = useState({ open: false, lesson: null, subjectId: null });
    // Filter subjects by teacher groups
    const filterSubjectsByTeacherGroups = useCallback(() => {
        const selectedGroupIds = window.SELECTED_TEACHER_GROUPS;
        // Don't filter if we don't have student groups data yet
        if (studentGroups.length === 0) {
            return;
        }
        if (!selectedGroupIds || selectedGroupIds.length === 0) {
            // If no teacher selected or no groups, show all subjects
            setFilteredSubjects(subjects);
            return;
        }
        // Filter subjects by their group membership
        const filtered = subjects.filter(subject => {
            if (!subject.group_name)
                return true; // If no group restriction, show to all teachers
            // Parse subject's group names and check if any match selected teacher's groups  
            const subjectGroupNames = subject.group_name.split(',').map((g) => g.trim());
            const teacherGroupNames = studentGroups
                .filter(group => selectedGroupIds.includes(group.id))
                .map(group => group.name);
            return subjectGroupNames.some((subjectGroup) => teacherGroupNames.includes(subjectGroup));
        });
        setFilteredSubjects(filtered);
    }, [subjects, studentGroups]);
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
    const filterStudentsByTeacherGroups = useCallback(() => {
        const selectedGroupIds = window.SELECTED_TEACHER_GROUPS;
        // Don't filter if we don't have student groups data yet
        if (studentGroups.length === 0) {
            setFilteredStudents(students);
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
    // Navigation helpers for keyboard shortcuts (moved before useEffect to fix scope issues)
    const enrolledStudents = filteredStudents.filter(s => s.subjects && s.subjects.includes(selectedSubjectId));
    // Students in display order (grouped, then sorted within groups) for consistent navigation
    const groupedEnrolledStudents = useMemo(() => groupAndSortStudents(enrolledStudents), [enrolledStudents]);
    const displayedStudents = useMemo(() => groupedEnrolledStudents.flatMap(group => group.students), [groupedEnrolledStudents]);
    const displayedStudentIndex = useMemo(() => {
        const map = new Map();
        displayedStudents.forEach((student, index) => map.set(student.id, index));
        return map;
    }, [displayedStudents]);
    const filteredSubjectLessons = subjectLessons[selectedSubjectId] || [];
    const currentLessonIndex = filteredSubjectLessons.findIndex(l => l.id === selectedLessonId);
    const availableSubjects = useMemo(() => {
        return filteredSubjects.filter(s => students.some(student => student.subjects?.includes(s.id)));
    }, [filteredSubjects, students]);
    const currentSubjectIndex = useMemo(() => {
        return availableSubjects.findIndex(s => s.id === selectedSubjectId);
    }, [availableSubjects, selectedSubjectId]);
    // Helper function to check lesson grading status
    const getLessonGradingStatus = (lessonId) => {
        if (enrolledStudents.length === 0)
            return 'none';
        const studentsWithGrades = enrolledStudents.filter(student => {
            const existingGrade = grades.find(g => g.studentId === student.id && g.lessonId === lessonId);
            return existingGrade !== undefined;
        });
        if (studentsWithGrades.length === 0)
            return 'none';
        if (studentsWithGrades.length === enrolledStudents.length)
            return 'complete';
        return 'partial';
    };
    // Inline editing functions
    const startEditingGrade = (studentId, lessonId, currentValue) => {
        setEditingCell({ studentId, lessonId });
        setTempGradeValue(currentValue);
        // Ensure text selection happens after the input is rendered and focused
        if (currentValue) {
            setTimeout(() => {
                const activeElement = document.activeElement;
                if (activeElement && activeElement.tagName === 'INPUT') {
                    activeElement.select();
                }
            }, 50);
        }
    };
    // Function to switch between entry and table modes while preserving current selection
    const switchViewMode = (newMode) => {
        const currentMode = activeView;
        if (currentMode === newMode)
            return; // No change needed
        // Store current student/lesson context
        let currentStudentId = null;
        let currentLessonId = selectedLessonId;
        // Determine current student based on mode
        if (currentMode === 'entry') {
            // In entry mode, check focused cell or use first student
            if (focusedCell && enrolledStudents[focusedCell.row]) {
                currentStudentId = enrolledStudents[focusedCell.row].id;
            }
            else if (enrolledStudents.length > 0) {
                currentStudentId = enrolledStudents[0].id;
            }
        }
        else if (currentMode === 'table') {
            // In table mode, use editingCell or focused context
            if (editingCell) {
                currentStudentId = editingCell.studentId;
                currentLessonId = editingCell.lessonId;
            }
            else if (focusedCell && enrolledStudents[focusedCell.row]) {
                currentStudentId = enrolledStudents[focusedCell.row].id;
            }
            else if (enrolledStudents.length > 0) {
                currentStudentId = enrolledStudents[0].id;
            }
        }
        // Switch the mode
        setActiveView(newMode);
        // Focus appropriate cell/input in new mode after a brief delay
        setTimeout(() => {
            if (newMode === 'entry') {
                // Switching to entry mode - focus the input for current student
                if (currentStudentId && currentLessonId) {
                    setSelectedLessonId(currentLessonId);
                    const input = inputRefs.current[currentStudentId];
                    if (input) {
                        input.focus();
                        const studentIndex = enrolledStudents.findIndex(s => s.id === currentStudentId);
                        if (studentIndex !== -1) {
                            setFocusedCell({ row: studentIndex, col: 0 });
                        }
                    }
                }
            }
            else if (newMode === 'table') {
                // Switching to table mode - start editing the same cell
                if (currentStudentId && currentLessonId) {
                    setSelectedLessonId(currentLessonId);
                    const existingGrade = grades.find(g => g.studentId === currentStudentId && g.lessonId === currentLessonId);
                    const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                    const currentValue = existingGrade
                        ? (isSkipped ? 'S' : (entryMode === 'percentage'
                            ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                            : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                        : '';
                    startEditingGrade(currentStudentId, currentLessonId, currentValue);
                }
            }
        }, 100);
        toast.success(`Switched to ${newMode} mode`);
    };
    // Global keyboard shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            const keyboardEvent = e;
            // Disable all shortcuts when lesson editing modal is open
            if (editLessonDialog.open) {
                return; // Let modal handle all keys normally
            }
            // Only handle shortcuts if we're not in an input field (except for specific cases)
            const target = keyboardEvent.target;
            const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
            // Allow certain shortcuts to work even in input fields
            const allowedInInput = ['F1', 'F2', 'Escape', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
            // Check if the key combination should be allowed in input fields
            const shouldAllowInInput = allowedInInput.includes(keyboardEvent.key) ||
                (keyboardEvent.key === 'ArrowUp' && keyboardEvent.shiftKey) ||
                (keyboardEvent.key === 'ArrowDown' && keyboardEvent.shiftKey) ||
                keyboardEvent.key === ' ';
            if (isInputField && !shouldAllowInInput) {
                return; // Let input field handle the key
            }
            switch (keyboardEvent.key) {
                case ' ':
                    // Space key: focus lesson points input
                    if (lessonPointsRef.current && selectedLesson) {
                        keyboardEvent.preventDefault();
                        lessonPointsRef.current.focus();
                        lessonPointsRef.current.select(); // Select all text for easy editing
                        toast.success('Lesson points selected');
                    }
                    break;
                case 'F1':
                    keyboardEvent.preventDefault();
                    setEntryMode(entryMode === 'percentage' ? 'errors' : 'percentage');
                    toast.success(`Switched to ${entryMode === 'percentage' ? 'errors' : 'percentage'} mode`);
                    break;
                case 'F2':
                    keyboardEvent.preventDefault();
                    switchViewMode(activeView === 'entry' ? 'table' : 'entry');
                    break;
                case 'PageUp':
                    keyboardEvent.preventDefault();
                    if (enrolledStudents.length > 0) {
                        if (activeView === 'table' && selectedLessonId) {
                            // Table view: start editing first student in current lesson
                            const firstStudent = enrolledStudents[0];
                            const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === selectedLessonId);
                            const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                            const currentValue = existingGrade
                                ? (isSkipped ? 'S' : (entryMode === 'percentage'
                                    ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                                    : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                : '';
                            startEditingGrade(firstStudent.id, selectedLessonId, currentValue);
                            toast.success('Jumped to first student');
                        }
                        else {
                            // Entry view: focus first input
                            const firstStudentId = enrolledStudents[0].id;
                            const firstInput = inputRefs.current[firstStudentId];
                            firstInput?.focus();
                            setFocusedCell({ row: 0, col: 0 });
                            toast.success('Jumped to first student');
                        }
                    }
                    break;
                case 'PageDown':
                    keyboardEvent.preventDefault();
                    if (enrolledStudents.length > 0) {
                        if (activeView === 'table' && selectedLessonId) {
                            // Table view: start editing last student in current lesson
                            const lastStudent = enrolledStudents[enrolledStudents.length - 1];
                            const existingGrade = grades.find(g => g.studentId === lastStudent.id && g.lessonId === selectedLessonId);
                            const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                            const currentValue = existingGrade
                                ? (isSkipped ? 'S' : (entryMode === 'percentage'
                                    ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                                    : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                : '';
                            startEditingGrade(lastStudent.id, selectedLessonId, currentValue);
                            toast.success('Jumped to last student');
                        }
                        else {
                            // Entry view: focus last input
                            const lastStudentId = enrolledStudents[enrolledStudents.length - 1].id;
                            const lastInput = inputRefs.current[lastStudentId];
                            lastInput?.focus();
                            setFocusedCell({ row: enrolledStudents.length - 1, col: 0 });
                            toast.success('Jumped to last student');
                        }
                    }
                    break;
                case 'ArrowLeft':
                    // Skip global navigation if currently editing a table cell (let cell handler manage it)
                    if (activeView === 'table' && editingCell) {
                        break;
                    }
                    keyboardEvent.preventDefault();
                    if (currentLessonIndex > 0) {
                        // Save all pending grades before switching lessons
                        saveAllPendingGrades().then(() => {
                            const prevLesson = filteredSubjectLessons[currentLessonIndex - 1];
                            setSelectedLessonId(prevLesson.id);
                            if (activeView === 'table') {
                                // Table mode: auto-select first student in new lesson (no toast)
                                setTimeout(() => {
                                    if (enrolledStudents.length > 0) {
                                        const firstStudent = enrolledStudents[0];
                                        const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === prevLesson.id);
                                        const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                                        const currentValue = existingGrade
                                            ? (isSkipped ? 'S' : (entryMode === 'percentage'
                                                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                                                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                            : '';
                                        startEditingGrade(firstStudent.id, prevLesson.id, currentValue);
                                    }
                                }, 100);
                            }
                            else {
                                // Entry mode: focus first input with toast
                                setTimeout(() => {
                                    const firstStudentId = enrolledStudents[0]?.id;
                                    if (firstStudentId) {
                                        const firstInput = inputRefs.current[firstStudentId];
                                        firstInput?.focus();
                                        // Auto-select the text if there's a value
                                        if (firstInput && firstInput.value) {
                                            setTimeout(() => firstInput.select(), 0);
                                        }
                                        setFocusedCell({ row: 0, col: 0 });
                                    }
                                }, 100);
                                toast.success(`Switched to ${prevLesson.name}`);
                            }
                        });
                    }
                    break;
                case 'ArrowRight':
                    // Skip global navigation if currently editing a table cell (let cell handler manage it)
                    if (activeView === 'table' && editingCell) {
                        break;
                    }
                    keyboardEvent.preventDefault();
                    if (currentLessonIndex < filteredSubjectLessons.length - 1) {
                        // Save all pending grades before switching lessons
                        saveAllPendingGrades().then(() => {
                            const nextLesson = filteredSubjectLessons[currentLessonIndex + 1];
                            setSelectedLessonId(nextLesson.id);
                            if (activeView === 'table') {
                                // Table mode: auto-select first student in new lesson (no toast)
                                setTimeout(() => {
                                    if (enrolledStudents.length > 0) {
                                        const firstStudent = enrolledStudents[0];
                                        const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === nextLesson.id);
                                        const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                                        const currentValue = existingGrade
                                            ? (isSkipped ? 'S' : (entryMode === 'percentage'
                                                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                                                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                            : '';
                                        startEditingGrade(firstStudent.id, nextLesson.id, currentValue);
                                    }
                                }, 100);
                            }
                            else {
                                // Entry mode: focus first input with toast
                                setTimeout(() => {
                                    const firstStudentId = enrolledStudents[0]?.id;
                                    if (firstStudentId) {
                                        const firstInput = inputRefs.current[firstStudentId];
                                        firstInput?.focus();
                                        // Auto-select the text if there's a value
                                        if (firstInput && firstInput.value) {
                                            setTimeout(() => firstInput.select(), 0);
                                        }
                                        setFocusedCell({ row: 0, col: 0 });
                                    }
                                }, 100);
                                toast.success(`Switched to ${nextLesson.name}`);
                            }
                        });
                    }
                    break;
                case 'ArrowUp':
                    if (keyboardEvent.shiftKey) {
                        keyboardEvent.preventDefault();
                        if (currentSubjectIndex > 0) {
                            // Save all pending grades before switching subjects
                            saveAllPendingGrades().then(() => {
                                const prevSubject = availableSubjects[currentSubjectIndex - 1];
                                setSelectedSubjectId(prevSubject.id);
                                setSelectedLessonId('');
                                // Set flag to focus first student after lesson auto-selection
                                setShouldFocusFirstStudent(true);
                                // Only show toast in entry mode
                                if (activeView === 'entry') {
                                    toast.success(`Switched to ${prevSubject.name}`);
                                }
                            });
                        }
                    }
                    break;
                case 'ArrowDown':
                    if (keyboardEvent.shiftKey) {
                        keyboardEvent.preventDefault();
                        if (currentSubjectIndex < availableSubjects.length - 1) {
                            // Save all pending grades before switching subjects
                            saveAllPendingGrades().then(() => {
                                const nextSubject = availableSubjects[currentSubjectIndex + 1];
                                setSelectedSubjectId(nextSubject.id);
                                setSelectedLessonId('');
                                // Set flag to focus first student after lesson auto-selection
                                setShouldFocusFirstStudent(true);
                                // Only show toast in entry mode
                                if (activeView === 'entry') {
                                    toast.success(`Switched to ${nextSubject.name}`);
                                }
                            });
                        }
                    }
                    break;
                case 'Escape':
                    keyboardEvent.preventDefault();
                    // Find currently focused input and blur it
                    const focusedElement = document.activeElement;
                    if (focusedElement && focusedElement.tagName === 'INPUT') {
                        focusedElement.blur();
                    }
                    setFocusedCell(null);
                    break;
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [
        entryMode,
        enrolledStudents,
        currentLessonIndex,
        filteredSubjectLessons,
        currentSubjectIndex,
        availableSubjects,
        selectedSubjectId,
        activeView,
        selectedLessonId,
        startEditingGrade,
        switchViewMode,
        focusedCell,
        editingCell,
        grades,
        editLessonDialog
    ]);
    // Debugging fetchSubjectLessons to ensure lessons are fetched correctly
    useEffect(() => {
        async function fetchSubjectLessons() {
            try {
                console.log('Fetching lessons for subject:', selectedSubjectId);
                setLoadingLessons(prev => ({ ...prev, [selectedSubjectId]: true }));
                const res = await apiClient.getLessonsForSubject(selectedSubjectId);
                console.log('Lessons fetched:', res.data);
                setSubjectLessons((prev) => ({
                    ...prev,
                    [selectedSubjectId]: Array.isArray(res.data) ? res.data : [],
                }));
            }
            catch (error) {
                console.error('Failed to fetch lessons for subject:', error);
            }
            finally {
                setLoadingLessons(prev => ({ ...prev, [selectedSubjectId]: false }));
            }
        }
        if (selectedSubjectId) {
            fetchSubjectLessons();
        }
        else {
            // Clear loading state when no subject is selected
            setLoadingLessons({});
        }
    }, [selectedSubjectId]);
    // Safeguard for selectedSubject
    const selectedSubject = Array.isArray(subjects) && subjects.length > 0
        ? subjects.find(s => s.id === selectedSubjectId)
        : undefined;
    // Safeguard for selectedLesson - use subjectLessons instead of selectedSubject.lessons
    const selectedLesson = selectedSubjectId && subjectLessons[selectedSubjectId]
        ? subjectLessons[selectedSubjectId].find(l => l.id === selectedLessonId)
        : undefined;
    // Placeholder for tab navigation. Replace with your actual tab switch logic.
    const goToTab = (tab) => {
        // Example: setActiveTab(tab)
        // You can replace this with your actual navigation logic or context
        window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab } }));
    };
    // Navigate to Students tab and highlight Add Student button
    const goToStudentsAndAddStudent = () => {
        window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab: 'students' } }));
        setTimeout(() => {
            window?.dispatchEvent(new CustomEvent('gradeflow-students-highlight-action', { detail: { action: 'add-student' } }));
        }, 100);
    };
    // Navigate to Subjects tab and highlight Add Subject button
    const goToSubjectsAndAddSubject = () => {
        window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab: 'subjects' } }));
        setTimeout(() => {
            window?.dispatchEvent(new CustomEvent('gradeflow-subjects-highlight-action', { detail: { action: 'add-subject' } }));
        }, 100);
    };
    // Navigate to Subjects tab and highlight action for specific subject
    const goToSubjectsAndHighlight = (subjectId, action) => {
        window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab: 'subjects' } }));
        setTimeout(() => {
            window?.dispatchEvent(new CustomEvent('gradeflow-subjects-expand-and-highlight', {
                detail: { subjectId, action }
            }));
        }, 100);
    };
    // Lesson editing functions
    function editLesson(lesson, subjectId) {
        setEditLessonDialog({ open: true, lesson, subjectId });
    }
    async function handleEditLessonSave(updated) {
        if (!editLessonDialog.lesson || !editLessonDialog.subjectId)
            return;
        try {
            // Convert type name to categoryId if type is provided
            const updateData = { ...updated };
            if (updated.type) {
                const categoryId = getCategoryIdFromTypeName(updated.type);
                if (categoryId) {
                    updateData.categoryId = categoryId;
                    // Remove type since we're sending categoryId
                    delete updateData.type;
                }
            }
            await apiClient.updateLesson(editLessonDialog.lesson.id, updateData);
            // Refresh lessons for this subject
            const subjectId = String(editLessonDialog.subjectId);
            const lessonsRes = await apiClient.getLessonsForSubject(subjectId);
            const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
            setSubjectLessons(prev => ({ ...prev, [subjectId]: lessonsData }));
            setEditLessonDialog({ open: false, lesson: null, subjectId: null });
            toast.success('Lesson updated successfully');
        }
        catch (error) {
            console.error('Failed to update lesson:', error);
            toast.error('Failed to update lesson');
        }
    }
    function closeEditLessonDialog() {
        setEditLessonDialog({ open: false, lesson: null, subjectId: null });
    }
    // Add lesson function
    async function addLessonAfterSelected() {
        if (!selectedSubjectId)
            return;
        try {
            const currentLessons = subjectLessons[selectedSubjectId] || [];
            // If there are no lessons, add the first lesson with default properties
            if (currentLessons.length === 0) {
                // Find the first default category to use as the initial lesson type
                const defaultCategory = gradeCategoryTypes.find(cat => cat.is_default);
                const categoryId = defaultCategory?.id;
                await apiClient.addLessonsToSubject(selectedSubjectId, 1, "Lesson", // Default name
                undefined, // Don't send type, use categoryId instead
                10, // Default points
                categoryId // Send categoryId directly
                );
                // Refresh lessons and select the new one
                const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId);
                const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
                setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: lessonsData }));
                // Select the newly added lesson
                if (lessonsData.length > 0) {
                    const newLesson = lessonsData[0];
                    setSelectedLessonId(newLesson.id);
                    // Open editor for customization
                    editLesson(newLesson, selectedSubjectId);
                }
                toast.success('First lesson added successfully');
                return;
            }
            // If there are lessons but none selected, return early
            if (!selectedLessonId)
                return;
            const selectedLesson = currentLessons.find(l => l.id === selectedLessonId);
            if (!selectedLesson)
                return;
            // Find the index of the selected lesson
            const selectedLessonIndex = currentLessons.findIndex(l => l.id === selectedLessonId);
            const isLastLesson = selectedLessonIndex === currentLessons.length - 1;
            // Determine the name for the new lesson
            let newLessonName;
            if (isLastLesson) {
                // If it's the last lesson, provide the base name and let API handle numbering
                const match = selectedLesson.name.match(/^(.+?)\s*(\d+)$/);
                if (match) {
                    newLessonName = match[1].trim();
                }
                else {
                    newLessonName = selectedLesson.name;
                }
            }
            else {
                // If it's not the last lesson, provide a base name
                const match = selectedLesson.name.match(/^(.+?)\s*(\d*)$/);
                if (match) {
                    newLessonName = match[1].trim();
                }
                else {
                    newLessonName = selectedLesson.name;
                }
            }
            if (!isLastLesson) {
                // For middle insertion, we'll add the lesson and then reorder everything
                // Add the new lesson first
                const categoryId = getCategoryIdFromTypeName(selectedLesson.type);
                await apiClient.addLessonsToSubject(selectedSubjectId, 1, newLessonName, undefined, // Don't send type, use categoryId instead
                selectedLesson.points, categoryId);
                // Get all lessons including the newly added one
                const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId);
                const allLessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
                // Find the newly added lesson
                const newLesson = allLessons.find(l => !currentLessons.some(old => old.id === l.id));
                if (newLesson) {
                    // Create the desired order: insert new lesson after the selected one
                    const reorderedLessons = [];
                    for (let i = 0; i <= selectedLessonIndex; i++) {
                        reorderedLessons.push(currentLessons[i]);
                    }
                    // Insert the new lesson
                    reorderedLessons.push(newLesson);
                    // Add the remaining lessons
                    for (let i = selectedLessonIndex + 1; i < currentLessons.length; i++) {
                        reorderedLessons.push(currentLessons[i]);
                    }
                    // Update orderIndex for all lessons
                    for (let i = 0; i < reorderedLessons.length; i++) {
                        await apiClient.updateLesson(reorderedLessons[i].id, { orderIndex: i });
                    }
                    // Final refresh to get the correctly ordered lessons
                    const finalRes = await apiClient.getLessonsForSubject(selectedSubjectId);
                    const finalLessonsData = Array.isArray(finalRes.data) ? finalRes.data : [];
                    setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: finalLessonsData }));
                    // Select the new lesson and open editor for customization
                    setSelectedLessonId(newLesson.id);
                    editLesson(newLesson, selectedSubjectId);
                }
            }
            else {
                // For last lesson, just add normally
                const categoryId = getCategoryIdFromTypeName(selectedLesson.type);
                await apiClient.addLessonsToSubject(selectedSubjectId, 1, newLessonName, undefined, // Don't send type, use categoryId instead
                selectedLesson.points, categoryId);
                // Refresh lessons and select the new one
                const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId);
                const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
                setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: lessonsData }));
                // Find and select the newly added lesson
                const newLesson = lessonsData.find(l => !currentLessons.some(old => old.id === l.id));
                if (newLesson) {
                    setSelectedLessonId(newLesson.id);
                }
            }
            toast.success('New lesson added successfully');
        }
        catch (error) {
            console.error('Failed to add lesson:', error);
            toast.error('Failed to add lesson');
        }
    }
    // Auto-select first lesson without grades when subject changes
    useEffect(() => {
        if (selectedSubjectId && selectedSubject && subjectLessons[selectedSubjectId]) {
            const findFirstLessonWithoutGrades = () => {
                const lessons = subjectLessons[selectedSubjectId] ?? [];
                if (lessons.length === 0) {
                    return ""; // No lessons available
                }
                // Sort lessons by orderIndex
                const sortedLessons = lessons.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
                // Find the first lesson that has no grades
                for (const lesson of sortedLessons) {
                    const hasGrades = enrolledStudents.some(student => {
                        const existingGrade = grades.find(g => g.studentId === student.id && g.lessonId === lesson.id);
                        return existingGrade !== undefined;
                    });
                    if (!hasGrades) {
                        return lesson.id;
                    }
                }
                // If all lessons have grades, select the last lesson
                return sortedLessons[sortedLessons.length - 1]?.id || "";
            };
            // Only auto-select if no lesson is currently selected or if current lesson is not in available lessons
            const availableLessonIds = subjectLessons[selectedSubjectId]?.map(l => l.id) || [];
            const isCurrentLessonValid = selectedLessonId && availableLessonIds.includes(selectedLessonId);
            if (!isCurrentLessonValid) {
                const firstLessonWithoutGradesId = findFirstLessonWithoutGrades();
                if (firstLessonWithoutGradesId) {
                    setSelectedLessonId(firstLessonWithoutGradesId);
                }
            }
        }
    }, [selectedSubjectId, selectedSubject, enrolledStudents, grades, subjectLessons]);
    // Initialize grade values when lesson changes
    useEffect(() => {
        if (selectedLessonId) {
            const lessonGrades = grades.filter(g => g.lessonId === selectedLessonId);
            const gradeMap = {};
            lessonGrades.forEach(grade => {
                // Check if grade was skipped: percentage is 0 and errors equal maxPoints
                const percentage = grade.percentage || 0;
                const errors = grade.errors || 0;
                const maxPoints = grade.maxPoints || grade.points || 0;
                const isSkipped = percentage === 0 && errors === maxPoints;
                if (isSkipped) {
                    gradeMap[grade.studentId] = 'S';
                }
                else if (entryMode === 'percentage') {
                    gradeMap[grade.studentId] = grade.percentage != null ? grade.percentage.toString() : '';
                }
                else {
                    // For errors mode, show errors 
                    const errorsValue = grade.errors || (grade.maxPoints ? grade.maxPoints - grade.points : 0);
                    gradeMap[grade.studentId] = errorsValue.toString();
                }
            });
            setGradeValues(gradeMap);
        }
    }, [selectedLessonId, grades, entryMode, subjectLessons]);
    // Initialize lesson points when lesson changes
    useEffect(() => {
        if (selectedLesson) {
            // Use points field from database (which is maxPoints in frontend terms)
            const lessonMaxPoints = selectedLesson.points || selectedLesson.maxPoints;
            if (lessonMaxPoints) {
                setLessonPoints(lessonMaxPoints.toString());
            }
            else {
                setLessonPoints("");
            }
        }
        else {
            setLessonPoints("");
        }
    }, [selectedLesson]);
    // Ensure selectedLesson is updated correctly
    useEffect(() => {
        if (selectedLessonId && subjectLessons[selectedSubjectId]) {
            const lesson = subjectLessons[selectedSubjectId].find(l => l.id === selectedLessonId);
            if (lesson) {
                setLessonPoints((lesson.points || lesson.maxPoints)?.toString() || "");
            }
        }
    }, [selectedLessonId, selectedSubjectId, subjectLessons]);
    // Persist selected subject and lesson to localStorage
    useEffect(() => {
        if (selectedSubjectId) {
            localStorage.setItem('gradeflow-selectedSubjectId', selectedSubjectId);
        }
    }, [selectedSubjectId]);
    useEffect(() => {
        if (selectedLessonId) {
            localStorage.setItem('gradeflow-selectedLessonId', selectedLessonId);
        }
    }, [selectedLessonId]);
    // Focus first student after subject switching and lesson auto-selection
    useEffect(() => {
        if (shouldFocusFirstStudent && selectedLessonId && enrolledStudents.length > 0) {
            // Use a small delay to ensure DOM is ready and other effects have completed
            const timeoutId = setTimeout(() => {
                if (activeView === 'table') {
                    // Table view: start editing first student in current lesson
                    const firstStudent = enrolledStudents[0];
                    const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === selectedLessonId);
                    const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                    const currentValue = existingGrade
                        ? (isSkipped ? 'S' : (entryMode === 'percentage'
                            ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                            : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                        : '';
                    startEditingGrade(firstStudent.id, selectedLessonId, currentValue);
                }
                else {
                    // Entry view: focus first input
                    const firstStudentId = enrolledStudents[0].id;
                    const firstInput = inputRefs.current[firstStudentId];
                    if (firstInput) {
                        firstInput.focus();
                        setFocusedCell({ row: 0, col: 0 });
                    }
                }
                setShouldFocusFirstStudent(false); // Reset the flag
            }, 100); // Shorter delay since we're being more precise about timing
            return () => clearTimeout(timeoutId);
        }
    }, [shouldFocusFirstStudent, selectedLessonId, enrolledStudents, activeView, grades, entryMode]);
    // Handle fraction entry and auto-set lesson points
    const processFractionEntry = (value, lessonId) => {
        const fractionMatch = value.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
        if (fractionMatch) {
            const points = parseFloat(fractionMatch[1]);
            const maxPoints = parseFloat(fractionMatch[2]);
            // Auto-update lesson max points if different
            const currentMaxPoints = selectedLesson ? (selectedLesson.points || selectedLesson.maxPoints) : undefined;
            if (selectedLesson && currentMaxPoints !== maxPoints) {
                // Update subjectLessons state
                setSubjectLessons(current => ({
                    ...current,
                    [selectedSubjectId]: current[selectedSubjectId]?.map(lesson => lesson.id === lessonId
                        ? { ...lesson, points: maxPoints }
                        : lesson) || []
                }));
                // Also update subjects state if it has lessons
                setSubjects(current => current.map(subject => subject.id === selectedSubjectId && subject.lessons
                    ? {
                        ...subject,
                        lessons: subject.lessons.map(lesson => lesson.id === lessonId
                            ? { ...lesson, points: maxPoints }
                            : lesson)
                    }
                    : subject));
                toast.success(`Auto-updated lesson max points to ${maxPoints}`);
            }
            return points;
        }
        return null;
    };
    // Handle letter grade conversion
    const processLetterGrade = (value) => {
        const letterGradeMap = {
            'A+': 98.5, 'A': 95, 'A-': 91.5,
            'B+': 88.5, 'B': 85, 'B-': 81.5,
            'C+': 78.5, 'C': 75, 'C-': 71.5,
            'D+': 68.5, 'D': 65, 'D-': 61.5,
            'F': 50
        };
        const upperValue = value.toUpperCase().trim();
        return letterGradeMap[upperValue] || null;
    };
    const handleKeyNavigation = (e, studentId, studentIndex) => {
        const totalStudents = displayedStudents.length;
        const index = displayedStudentIndex.get(studentId) ?? studentIndex;
        switch (e.key) {
            case 'ArrowUp':
                if (!e.shiftKey) {
                    e.preventDefault();
                    if (index > 0) {
                        const prevStudentId = displayedStudents[index - 1].id;
                        const prevInput = inputRefs.current[prevStudentId];
                        prevInput?.focus();
                        setFocusedCell({ row: index - 1, col: 0 });
                    }
                }
                // Shift+ArrowUp is handled globally
                break;
            case 'ArrowDown':
                if (!e.shiftKey) {
                    e.preventDefault();
                    // Navigate to next student (normal down arrow)
                    if (index < totalStudents - 1) {
                        const nextStudentId = displayedStudents[index + 1].id;
                        const nextInput = inputRefs.current[nextStudentId];
                        nextInput?.focus();
                        setFocusedCell({ row: index + 1, col: 0 });
                    }
                }
                // Shift+ArrowDown is handled globally
                break;
            case 'Enter':
                e.preventDefault();
                if (index < totalStudents - 1) {
                    const nextStudentId = displayedStudents[index + 1].id;
                    const nextInput = inputRefs.current[nextStudentId];
                    nextInput?.focus();
                    setFocusedCell({ row: index + 1, col: 0 });
                }
                else {
                    // If last student, save current grade first, then jump to next lesson
                    const currentStudentId = displayedStudents[index]?.id || studentId;
                    const currentValue = gradeValues[currentStudentId];
                    // Save the current grade if there's a value
                    if (currentValue && currentValue.trim() !== '') {
                        saveGrade(currentStudentId).then(() => {
                            // After saving, switch to next lesson
                            if (currentLessonIndex < filteredSubjectLessons.length - 1) {
                                const nextLesson = filteredSubjectLessons[currentLessonIndex + 1];
                                setSelectedLessonId(nextLesson.id);
                                // Wait for lesson change, then focus first student
                                setTimeout(() => {
                                    const firstStudentId = displayedStudents[0]?.id;
                                    if (firstStudentId) {
                                        const firstInput = inputRefs.current[firstStudentId];
                                        firstInput?.focus();
                                        setFocusedCell({ row: 0, col: 0 });
                                    }
                                }, 200);
                                toast.success(`Grade saved and switched to ${nextLesson.name}`);
                            }
                            else {
                                toast.info('Grade saved - no more lessons in this subject');
                            }
                        }).catch((error) => {
                            console.error('Failed to save grade before lesson switch:', error);
                            toast.error('Failed to save grade');
                        });
                    }
                    else {
                        // No grade to save, just switch lesson
                        if (currentLessonIndex < filteredSubjectLessons.length - 1) {
                            const nextLesson = filteredSubjectLessons[currentLessonIndex + 1];
                            setSelectedLessonId(nextLesson.id);
                            // Wait for lesson change, then focus first student
                            setTimeout(() => {
                                const firstStudentId = displayedStudents[0]?.id;
                                if (firstStudentId) {
                                    const firstInput = inputRefs.current[firstStudentId];
                                    firstInput?.focus();
                                    setFocusedCell({ row: 0, col: 0 });
                                }
                            }, 200);
                            toast.success(`Switched to ${nextLesson.name}`);
                        }
                        else {
                            toast.info('No more lessons in this subject');
                        }
                    }
                }
                break;
            case 's':
            case 'S':
                e.preventDefault();
                // Skip this lesson for current student
                updateGradeValue(studentId, 's');
                // Auto-save the skip
                setTimeout(() => saveGrade(studentId), 100);
                toast.success('Lesson skipped for this student');
                break;
        }
    };
    const updateGradeValue = (studentId, value) => {
        setGradeValues(prev => ({ ...prev, [studentId]: value }));
    };
    const updateLessonPoints = async (newMaxPoints) => {
        if (!selectedLesson || !selectedSubjectId)
            return;
        try {
            // Update the backend first
            await apiClient.updateLesson(selectedLessonId, { points: newMaxPoints });
            // Update subjectLessons state (primary source)
            setSubjectLessons(current => ({
                ...current,
                [selectedSubjectId]: current[selectedSubjectId]?.map(lesson => lesson.id === selectedLessonId
                    ? { ...lesson, points: newMaxPoints }
                    : lesson) || []
            }));
            // Also update subjects state if it has lessons
            setSubjects(current => current.map(subject => subject.id === selectedSubjectId && subject.lessons
                ? {
                    ...subject,
                    lessons: subject.lessons.map(lesson => lesson.id === selectedLessonId
                        ? { ...lesson, points: newMaxPoints }
                        : lesson)
                }
                : subject));
            toast.success(`Updated lesson max points to ${newMaxPoints}`);
        }
        catch (error) {
            console.error('Failed to update lesson points:', error);
            toast.error('Failed to update lesson points');
        }
    };
    // Refine handling of selectedLesson.maxPoints
    const placeholderValue = selectedLesson
        ? (selectedLesson.points || selectedLesson.maxPoints || 0).toString()
        : "0";
    // Save all pending grades for the current lesson
    const saveAllPendingGrades = async () => {
        if (!selectedLessonId)
            return;
        const savePromises = [];
        // Find all students with unsaved grade values
        for (const studentId of Object.keys(gradeValues)) {
            const currentValue = gradeValues[studentId];
            // Only save if there's a value and the student is enrolled in this subject
            if (currentValue && currentValue.trim() && enrolledStudents.some(s => s.id === studentId)) {
                // Check if this value is different from the existing grade
                const existingGrade = grades.find(g => g.studentId === studentId && g.lessonId === selectedLessonId);
                const existingValue = getGradeDisplayValue(existingGrade);
                if (currentValue !== existingValue) {
                    savePromises.push(saveGrade(studentId));
                }
            }
        }
        // Save all grades in parallel
        if (savePromises.length > 0) {
            try {
                await Promise.all(savePromises);
                console.log(`Auto-saved ${savePromises.length} pending grades before lesson switch`);
            }
            catch (error) {
                console.error('Error auto-saving grades:', error);
                toast.error('Failed to save some grades before switching lessons');
            }
        }
    };
    // Helper function to get display value from a grade (for comparison)
    const getGradeDisplayValue = (grade) => {
        if (!grade)
            return '';
        const isSkipped = grade.percentage === 0 && grade.errors === (grade.maxPoints || grade.points);
        if (isSkipped)
            return 'S';
        if (entryMode === 'percentage') {
            return grade.percentage > 0 ? grade.percentage.toString() : '';
        }
        else {
            return grade.errors > 0 ? grade.errors.toString() : '';
        }
    };
    const saveGrade = async (studentId) => {
        const currentValue = gradeValues[studentId];
        if (!selectedLesson || !selectedLessonId) {
            return;
        }
        // If value is empty or undefined, check if there's an existing grade to delete
        if (!currentValue || !currentValue.trim()) {
            const existingGrade = grades.find(g => g.studentId === studentId && g.lessonId === selectedLessonId);
            if (existingGrade) {
                // Delete the existing grade
                await deleteGrade(studentId, selectedLessonId);
            }
            return;
        }
        try {
            let gradeData = {};
            const lowerValue = currentValue.toLowerCase();
            // Handle skip case
            if (lowerValue === 's') {
                const lessonMaxPoints = selectedLesson.points || 0;
                if (lessonMaxPoints <= 0) {
                    toast.error('Please set lesson points before skipping grades');
                    return;
                }
                gradeData.percentage = 0;
                gradeData.errors = lessonMaxPoints;
                gradeData.points = lessonMaxPoints;
            }
            else {
                // Handle letter grade
                const letterPercentage = processLetterGrade(currentValue);
                if (letterPercentage !== null) {
                    const lessonMaxPoints = selectedLesson.points || 0;
                    gradeData.percentage = letterPercentage;
                    gradeData.errors = lessonMaxPoints > 0
                        ? Math.round(lessonMaxPoints * (1 - letterPercentage / 100))
                        : 0;
                    gradeData.points = lessonMaxPoints;
                }
                else {
                    // Handle fraction entry
                    const fractionPoints = processFractionEntry(currentValue, selectedLessonId);
                    if (fractionPoints !== null) {
                        const maxPoints = parseFloat(currentValue.split('/')[1]);
                        if (maxPoints <= 0) {
                            toast.error('Invalid fraction - denominator must be greater than 0');
                            return;
                        }
                        gradeData.percentage = roundToNearestHalf(((fractionPoints / maxPoints) * 100));
                        gradeData.errors = Math.max(0, maxPoints - fractionPoints);
                        gradeData.points = maxPoints;
                    }
                    else {
                        // Handle numeric entry
                        const numericValue = parseFloat(currentValue);
                        if (!isNaN(numericValue)) {
                            const lessonMaxPoints = selectedLesson.points || 0;
                            if (entryMode === 'errors' && lessonMaxPoints <= 0) {
                                toast.error('Please set lesson points before entering grades in errors mode');
                                return;
                            }
                            if (entryMode === 'errors') {
                                const correctPoints = Math.max(0, lessonMaxPoints - numericValue);
                                gradeData.percentage = lessonMaxPoints > 0
                                    ? roundToNearestHalf(((correctPoints / lessonMaxPoints) * 100))
                                    : 0;
                                gradeData.errors = numericValue;
                                gradeData.points = lessonMaxPoints;
                            }
                            else {
                                gradeData.percentage = roundToNearestHalf(numericValue);
                                gradeData.errors = lessonMaxPoints > 0
                                    ? Math.round(lessonMaxPoints * (1 - numericValue / 100))
                                    : 0;
                                gradeData.points = lessonMaxPoints;
                            }
                        }
                        else {
                            return; // Invalid input
                        }
                    }
                }
            }
            // Save grade to backend
            const response = await apiClient.setGrade(studentId, selectedLessonId, gradeData);
            // Update local state
            const existingGradeIndex = grades.findIndex(g => g.studentId === studentId && g.lessonId === selectedLessonId);
            const newGrade = {
                id: response.data?.id || `${studentId}-${selectedLessonId}`,
                studentId,
                lessonId: selectedLessonId,
                subjectId: selectedSubjectId,
                percentage: gradeData.percentage,
                points: gradeData.points - (gradeData.errors || 0),
                maxPoints: gradeData.points,
                errors: gradeData.errors,
                date: new Date().toISOString(),
                notes: undefined,
                skipped: lowerValue === 's',
                created_at: response.data?.created_at,
                updated_at: response.data?.updated_at
            };
            if (existingGradeIndex !== -1) {
                setGrades(current => current.map((g, index) => index === existingGradeIndex ? newGrade : g));
            }
            else {
                setGrades(current => [...current, newGrade]);
            }
            const studentName = students.find(s => s.id === studentId)?.name;
            toast.success(`Grade saved for ${studentName}`);
        }
        catch (error) {
            console.error('Failed to save grade:', error);
            toast.error('Failed to save grade');
        }
    };
    // Delete grade function
    const deleteGrade = async (studentId, lessonId) => {
        try {
            // Call backend API to delete the grade
            await apiClient.deleteGrade(studentId, lessonId);
            // Update local state - remove the grade
            setGrades(current => current.filter(g => !(g.studentId === studentId && g.lessonId === lessonId)));
            // Clear the grade value from UI state
            setGradeValues(prev => {
                const updated = { ...prev };
                delete updated[studentId];
                return updated;
            });
            const studentName = students.find(s => s.id === studentId)?.name;
            const lesson = subjectLessons[selectedSubjectId]?.find(l => l.id === lessonId);
            toast.success(`Grade deleted for ${studentName} - ${lesson?.name || 'lesson'}`);
        }
        catch (error) {
            console.error('Failed to delete grade:', error);
            toast.error('Failed to delete grade');
        }
    };
    // Inline editing functions  
    const saveGradeInline = async (studentId, lessonId, keepEditing = false) => {
        if (!tempGradeValue.trim()) {
            // If value is empty, check if there's an existing grade to delete
            const existingGrade = grades.find(g => g.studentId === studentId && g.lessonId === lessonId);
            if (existingGrade) {
                // Delete the existing grade
                await deleteGrade(studentId, lessonId);
            }
            setEditingCell(null);
            return;
        }
        try {
            // Find the lesson to get max points
            const lesson = (subjectLessons[selectedSubjectId] || []).find(l => l.id === lessonId);
            if (!lesson) {
                toast.error('Lesson not found');
                return;
            }
            let gradeData = {};
            const lowerValue = tempGradeValue.toLowerCase();
            // Handle skip case
            if (lowerValue === 's') {
                const lessonMaxPoints = lesson.points || 0;
                if (lessonMaxPoints <= 0) {
                    toast.error('Please set lesson points before skipping grades');
                    return;
                }
                gradeData.percentage = 0;
                gradeData.errors = lessonMaxPoints;
                gradeData.points = lessonMaxPoints;
            }
            else {
                // Handle letter grade
                const letterPercentage = processLetterGrade(tempGradeValue);
                if (letterPercentage !== null) {
                    const lessonMaxPoints = lesson.points || 0;
                    gradeData.percentage = letterPercentage;
                    gradeData.errors = lessonMaxPoints > 0
                        ? Math.round(lessonMaxPoints * (1 - letterPercentage / 100))
                        : 0;
                    gradeData.points = lessonMaxPoints;
                }
                else {
                    // Handle fraction entry
                    const fractionPoints = processFractionEntry(tempGradeValue, lessonId);
                    if (fractionPoints !== null) {
                        const maxPoints = parseFloat(tempGradeValue.split('/')[1]);
                        if (maxPoints <= 0) {
                            toast.error('Invalid fraction - denominator must be greater than 0');
                            return;
                        }
                        gradeData.percentage = roundToNearestHalf(((fractionPoints / maxPoints) * 100));
                        gradeData.errors = Math.max(0, maxPoints - fractionPoints);
                        gradeData.points = maxPoints;
                    }
                    else {
                        // Handle numeric entry
                        const numericValue = parseFloat(tempGradeValue);
                        if (!isNaN(numericValue)) {
                            const lessonMaxPoints = lesson.points || 0;
                            if (entryMode === 'errors' && lessonMaxPoints <= 0) {
                                toast.error('Please set lesson points before entering grades in errors mode');
                                return;
                            }
                            if (entryMode === 'errors') {
                                const correctPoints = Math.max(0, lessonMaxPoints - numericValue);
                                gradeData.percentage = lessonMaxPoints > 0
                                    ? roundToNearestHalf(((correctPoints / lessonMaxPoints) * 100))
                                    : 0;
                                gradeData.errors = numericValue;
                                gradeData.points = lessonMaxPoints;
                            }
                            else {
                                gradeData.percentage = roundToNearestHalf(numericValue);
                                gradeData.errors = lessonMaxPoints > 0
                                    ? Math.round(lessonMaxPoints * (1 - numericValue / 100))
                                    : 0;
                                gradeData.points = lessonMaxPoints;
                            }
                        }
                        else {
                            toast.error('Invalid grade value');
                            return;
                        }
                    }
                }
            }
            // Save grade to backend
            const response = await apiClient.setGrade(studentId, lessonId, gradeData);
            // Update local state
            const existingGradeIndex = grades.findIndex(g => g.studentId === studentId && g.lessonId === lessonId);
            const newGrade = {
                id: response.data?.id || `${studentId}-${lessonId}`,
                studentId,
                lessonId,
                subjectId: selectedSubjectId,
                percentage: gradeData.percentage,
                points: gradeData.points - (gradeData.errors || 0),
                maxPoints: gradeData.points,
                errors: gradeData.errors,
                date: new Date().toISOString(),
                notes: undefined,
                skipped: lowerValue === 's',
                created_at: response.data?.created_at,
                updated_at: response.data?.updated_at
            };
            if (existingGradeIndex !== -1) {
                setGrades(current => current.map((g, index) => index === existingGradeIndex ? newGrade : g));
            }
            else {
                setGrades(current => [...current, newGrade]);
            }
            if (!keepEditing) {
                setEditingCell(null);
            }
            toast.success('Grade updated');
        }
        catch (error) {
            console.error('Failed to save grade:', error);
            toast.error('Failed to save grade');
        }
    };
    const startEditingLesson = (lessonId, currentType, currentPoints, focusOnPoints = false) => {
        setEditingLesson(lessonId);
        setTempLessonData({ type: currentType, points: currentPoints.toString() });
        setLessonEditFocusOnPoints(focusOnPoints);
    };
    const saveLessonInline = async (lessonId) => {
        try {
            const updates = {};
            if (tempLessonData.type) {
                const categoryId = getCategoryIdFromTypeName(tempLessonData.type);
                if (categoryId) {
                    updates.categoryId = categoryId;
                }
            }
            if (tempLessonData.points !== undefined) {
                const points = parseInt(tempLessonData.points);
                if (tempLessonData.points.trim() === '' || isNaN(points) || points <= 0) {
                    toast.error('Please enter a valid number of points (greater than 0)');
                    return;
                }
                updates.points = points;
            }
            if (Object.keys(updates).length === 0) {
                setEditingLesson(null);
                return;
            }
            await apiClient.updateLesson(lessonId, updates);
            // Refresh lessons for this subject to get updated type and type_color
            const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId);
            const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
            setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: lessonsData }));
            setEditingLesson(null);
            setLessonEditFocusOnPoints(false);
            setTempLessonData({}); // Clear temporary data
            // After saving lesson, focus on first student in table mode
            if (activeView === 'table' && displayedStudents.length > 0) {
                const firstStudent = displayedStudents[0];
                const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === lessonId);
                const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                const currentValue = existingGrade
                    ? (isSkipped ? 'S' : (entryMode === 'percentage'
                        ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                        : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                    : '';
                // Use a small delay to ensure the lesson editing state is cleared first
                setTimeout(() => {
                    startEditingGrade(firstStudent.id, lessonId, currentValue);
                }, 100);
            }
            toast.success('Lesson updated');
        }
        catch (error) {
            console.error('Failed to update lesson:', error);
            toast.error('Failed to update lesson');
        }
    };
    // Navigation function for inline editing
    const navigateToNextCell = (currentStudentId, currentLessonId) => {
        const currentLessons = (subjectLessons[selectedSubjectId] || [])
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        const currentStudents = displayedStudents;
        const currentStudentIndex = currentStudents.findIndex(s => s.id === currentStudentId);
        const currentLessonIndex = currentLessons.findIndex(l => l.id === currentLessonId);
        if (currentStudentIndex === -1 || currentLessonIndex === -1)
            return;
        // Try to move to next student in same lesson
        if (currentStudentIndex < currentStudents.length - 1) {
            const nextStudent = currentStudents[currentStudentIndex + 1];
            const existingGrade = grades.find(g => g.studentId === nextStudent.id && g.lessonId === currentLessonId);
            const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
            const currentValue = existingGrade
                ? (isSkipped ? 'S' : (entryMode === 'percentage'
                    ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                    : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                : '';
            startEditingGrade(nextStudent.id, currentLessonId, currentValue);
            return;
        }
        // Move to next lesson, first student
        if (currentLessonIndex < currentLessons.length - 1) {
            const nextLesson = currentLessons[currentLessonIndex + 1];
            const firstStudent = currentStudents[0];
            if (firstStudent) {
                const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === nextLesson.id);
                const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                const currentValue = existingGrade
                    ? (isSkipped ? 'S' : (entryMode === 'percentage'
                        ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                        : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                    : '';
                startEditingGrade(firstStudent.id, nextLesson.id, currentValue);
            }
            return;
        }
        // End of all lessons, stay on current cell
        setEditingCell(null);
    };
    const navigateToCell = async (direction, currentStudentId, currentLessonId) => {
        const currentLessons = (subjectLessons[selectedSubjectId] || [])
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        const currentStudents = displayedStudents;
        const currentStudentIndex = currentStudents.findIndex(s => s.id === currentStudentId);
        const currentLessonIndex = currentLessons.findIndex(l => l.id === currentLessonId);
        if (currentStudentIndex === -1 || currentLessonIndex === -1)
            return;
        let newStudentIndex = currentStudentIndex;
        let newLessonIndex = currentLessonIndex;
        switch (direction) {
            case 'up':
                newStudentIndex = Math.max(0, currentStudentIndex - 1);
                break;
            case 'down':
                newStudentIndex = Math.min(currentStudents.length - 1, currentStudentIndex + 1);
                break;
            case 'left':
                newLessonIndex = Math.max(0, currentLessonIndex - 1);
                break;
            case 'right':
                newLessonIndex = Math.min(currentLessons.length - 1, currentLessonIndex + 1);
                break;
        }
        if (newStudentIndex !== currentStudentIndex || newLessonIndex !== currentLessonIndex) {
            // Check if we're switching lessons and save pending grades if so
            const lessonChanged = newLessonIndex !== currentLessonIndex;
            if (lessonChanged) {
                // Save all pending grades before switching lessons
                await saveAllPendingGrades();
            }
            const newStudent = currentStudents[newStudentIndex];
            const newLesson = currentLessons[newLessonIndex];
            if (newStudent && newLesson) {
                const existingGrade = grades.find(g => g.studentId === newStudent.id && g.lessonId === newLesson.id);
                const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                const currentValue = existingGrade
                    ? (isSkipped ? 'S' : (entryMode === 'percentage'
                        ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                        : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                    : '';
                startEditingGrade(newStudent.id, newLesson.id, currentValue);
            }
        }
    };
    // Filter data when teacher selection changes or data is updated
    useEffect(() => {
        filterSubjectsByTeacherGroups();
    }, [filterSubjectsByTeacherGroups]);
    // Listen for teacher selection changes
    useEffect(() => {
        const handleTeacherChange = () => {
            // Close the select dropdown to force scroll recalculation
            setSubjectSelectOpen(false);
            filterSubjectsByTeacherGroups();
        };
        window.addEventListener('teacher-selection-changed', handleTeacherChange);
        return () => {
            window.removeEventListener('teacher-selection-changed', handleTeacherChange);
        };
    }, [filterSubjectsByTeacherGroups]);
    // Filter students when teacher selection changes or data is updated
    useEffect(() => {
        filterStudentsByTeacherGroups();
    }, [filterStudentsByTeacherGroups]);
    // Listen for teacher selection changes for student filtering
    useEffect(() => {
        const handleTeacherChange = () => {
            filterStudentsByTeacherGroups();
        };
        window.addEventListener('teacher-selection-changed', handleTeacherChange);
        return () => {
            window.removeEventListener('teacher-selection-changed', handleTeacherChange);
        };
    }, [filterStudentsByTeacherGroups]);
    // Update grade entry logic
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-bold text-foreground", children: "Grade Entry" }), _jsxs("p", { className: "text-muted-foreground", children: [selectedSubject?.name || "Select a subject", " - ", selectedLesson?.name || "Select a lesson"] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { variant: activeView === 'entry' ? 'default' : 'outline', onClick: () => switchViewMode('entry'), className: "flex items-center gap-2", children: [_jsx(Keyboard, { size: 16 }), "Entry"] }), _jsxs(Button, { variant: activeView === 'table' ? 'default' : 'outline', onClick: () => switchViewMode('table'), className: "flex items-center gap-2", children: [_jsx(Table, { size: 16 }), "Table"] })] })] }), activeView === 'table' ? (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs(CardTitle, { children: ["Grade Table - ", selectedSubject?.name || "Select a subject"] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Switch, { checked: entryMode === 'errors', onCheckedChange: (checked) => setEntryMode(checked ? 'errors' : 'percentage'), id: "table-entry-mode" }), _jsxs(Label, { htmlFor: "table-entry-mode", className: "sr-only", children: [entryMode === 'errors' ? 'Errors' : 'Percentage', " mode"] }), entryMode === 'errors' && (_jsxs(Badge, { variant: "outline", className: "text-xs", children: [_jsx(X, { size: 12, className: "mr-1" }), "Errors"] })), entryMode === 'percentage' && (_jsxs(Badge, { variant: "outline", className: "text-xs", children: [_jsx(Percent, { size: 12, className: "mr-1" }), "Percentage"] }))] }), _jsxs("div", { className: "hidden md:flex items-center gap-2 text-sm text-muted-foreground", children: [_jsx(Keyboard, { size: 16 }), "Click cells to edit grades inline \u2022 Use arrow keys to navigate \u2022 Enter to save & move to next \u2022 Click lesson headers to edit lesson properties"] })] })] }) }), _jsxs(CardContent, { children: [enrolledStudents.length === 0 ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "No students enrolled in this subject" })) : !selectedSubjectId ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "Please select a subject to view the grade table" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-border", children: [_jsx("th", { className: "text-left p-3 font-medium text-muted-foreground sticky left-0 bg-background z-10 min-w-[200px]", children: "Student" }), (subjectLessons[selectedSubjectId] || [])
                                                        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                                                        .map(lesson => (_jsx("th", { className: `text-center p-2 font-medium min-w-[100px]`, style: {
                                                            backgroundColor: !isDefaultLessonType(lesson.type)
                                                                ? `${getCategoryColor(lesson)}20`
                                                                : 'hsl(var(--muted))',
                                                            borderLeft: !isDefaultLessonType(lesson.type)
                                                                ? `2px solid ${getCategoryColor(lesson)}`
                                                                : undefined,
                                                            borderRight: !isDefaultLessonType(lesson.type)
                                                                ? `2px solid ${getCategoryColor(lesson)}`
                                                                : undefined
                                                        }, children: editingLesson === lesson.id ? (_jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-xs font-medium truncate max-w-[90px]", title: lesson.name, children: lesson.name }), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("select", { value: tempLessonData.type || lesson.type, onChange: async (e) => {
                                                                                setTempLessonData(prev => ({ ...prev, type: e.target.value }));
                                                                                // Auto-save when category changes
                                                                                const categoryId = getCategoryIdFromTypeName(e.target.value);
                                                                                if (categoryId) {
                                                                                    try {
                                                                                        await apiClient.updateLesson(lesson.id, { categoryId });
                                                                                        // Refresh lessons for this subject to get updated type and type_color
                                                                                        const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId);
                                                                                        const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
                                                                                        setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: lessonsData }));
                                                                                    }
                                                                                    catch (error) {
                                                                                        console.error('Failed to update lesson category:', error);
                                                                                        toast.error('Failed to update lesson category');
                                                                                    }
                                                                                }
                                                                            }, className: "text-xs p-1 border rounded", autoFocus: !lessonEditFocusOnPoints, children: gradeCategoryTypes.map(categoryType => (_jsx("option", { value: categoryType.name, children: categoryType.name }, categoryType.id))) }), _jsx("input", { type: "number", value: tempLessonData.points !== undefined ? tempLessonData.points : (lesson.points || ''), onChange: (e) => setTempLessonData(prev => ({ ...prev, points: e.target.value })), className: "text-xs p-1 border rounded w-full", placeholder: "points", autoFocus: lessonEditFocusOnPoints, onFocus: (e) => e.target.select(), onKeyDown: (e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    saveLessonInline(lesson.id);
                                                                                }
                                                                                else if (e.key === 'Escape') {
                                                                                    setEditingLesson(null);
                                                                                    setLessonEditFocusOnPoints(false);
                                                                                    setTempLessonData({}); // Clear temporary data
                                                                                }
                                                                            } })] })] })) : (_jsxs("div", { className: "space-y-1 cursor-pointer", onClick: () => startEditingLesson(lesson.id, lesson.type, lesson.points || 0, false), children: [_jsx("div", { className: "text-xs font-medium truncate max-w-[90px]", title: lesson.name, children: lesson.name }), _jsx(Badge, { className: "text-xs text-white border-0", style: { backgroundColor: getCategoryColor(lesson) }, children: lesson.type }), _jsxs("div", { className: "text-xs text-muted-foreground hover:bg-gray-100 rounded px-1", onClick: (e) => {
                                                                        e.stopPropagation();
                                                                        startEditingLesson(lesson.id, lesson.type, lesson.points || 0, true);
                                                                    }, title: "Click to edit points directly", children: [lesson.points, "pts"] })] })) }, lesson.id)))] }) }), _jsx("tbody", { children: groupedEnrolledStudents.map(({ groupName, students: groupStudents }) => (_jsxs(React.Fragment, { children: [_jsx("tr", { className: "bg-muted/40", children: _jsx("td", { colSpan: ((subjectLessons[selectedSubjectId] || []).length + 1), className: "p-2 font-semibold text-sm border-b-2 border-primary", children: groupName }) }), groupStudents.map((student) => (_jsxs("tr", { className: "border-b border-border hover:bg-muted/20", children: [_jsx("td", { className: "p-3 font-medium sticky left-0 bg-background z-10", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium", children: student.name.split(' ').map(n => n[0]).join('').toUpperCase() }), _jsx("span", { className: "truncate max-w-[150px]", title: student.name, children: student.name })] }) }), (subjectLessons[selectedSubjectId] || [])
                                                                .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                                                                .map(lesson => {
                                                                const existingGrade = grades.find(g => g.studentId === student.id && g.lessonId === lesson.id);
                                                                let displayValue = '';
                                                                let displayPercentage = 0;
                                                                let isSkipped = false;
                                                                if (existingGrade) {
                                                                    // Use stored values directly from database - convert to numbers
                                                                    const percentage = typeof existingGrade.percentage === 'number' ? existingGrade.percentage :
                                                                        (typeof existingGrade.percentage === 'string' ? parseFloat(existingGrade.percentage) : 0);
                                                                    const errors = typeof existingGrade.errors === 'number' ? existingGrade.errors :
                                                                        (typeof existingGrade.errors === 'string' ? parseFloat(existingGrade.errors) : 0);
                                                                    const maxPoints = existingGrade.maxPoints || existingGrade.points || 0;
                                                                    // Check if this is a skipped grade (0% with full errors)
                                                                    isSkipped = percentage === 0 && errors === maxPoints;
                                                                    if (isSkipped) {
                                                                        displayValue = 'S';
                                                                        displayPercentage = 0;
                                                                    }
                                                                    else if (entryMode === 'percentage') {
                                                                        displayValue = percentage > 0 ? percentage.toString() : '';
                                                                        displayPercentage = roundToNearestHalf(percentage);
                                                                    }
                                                                    else {
                                                                        displayValue = errors > 0 ? errors.toString() : '';
                                                                        // Calculate percentage from stored values for display
                                                                        const rawPercentage = maxPoints > 0 ? ((maxPoints - errors) / maxPoints) * 100 : 0;
                                                                        displayPercentage = roundToNearestHalf(rawPercentage);
                                                                    }
                                                                }
                                                                const getGradeColor = (percentage, skipped) => {
                                                                    if (skipped)
                                                                        return 'bg-gray-100 text-gray-600';
                                                                    if (percentage >= 90)
                                                                        return 'bg-green-100 text-green-800 border-green-200';
                                                                    if (percentage >= 70)
                                                                        return 'bg-blue-100 text-blue-800 border-blue-200';
                                                                    return 'bg-red-100 text-red-800 border-red-200';
                                                                };
                                                                return (_jsx("td", { className: `text-center p-2 border-x border-border cursor-pointer hover:bg-muted/50 transition-colors`, style: {
                                                                        backgroundColor: !isDefaultLessonType(lesson.type)
                                                                            ? `${getCategoryColor(lesson)}10`
                                                                            : undefined
                                                                    }, onClick: () => {
                                                                        if (editingCell?.studentId === student.id && editingCell?.lessonId === lesson.id) {
                                                                            return; // Already editing this cell
                                                                        }
                                                                        startEditingGrade(student.id, lesson.id, displayValue);
                                                                    }, children: editingCell?.studentId === student.id && editingCell?.lessonId === lesson.id ? (_jsx("div", { className: "space-y-1", children: _jsx("input", { type: "text", value: tempGradeValue, onChange: (e) => setTempGradeValue(e.target.value), className: "text-xs p-1 border rounded w-full text-center", placeholder: entryMode === 'percentage' ? '%' : 'errors', autoFocus: true, onFocus: (e) => e.target.select(), onKeyDown: async (e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    saveGradeInline(student.id, lesson.id, true);
                                                                                    setTimeout(() => navigateToNextCell(student.id, lesson.id), 50);
                                                                                }
                                                                                else if (e.key === 'Escape') {
                                                                                    setEditingCell(null);
                                                                                }
                                                                                else if (e.key === ' ') {
                                                                                    // Space key: in table mode, edit the lesson points for the current lesson
                                                                                    e.preventDefault();
                                                                                    if (activeView === 'table') {
                                                                                        // Start editing the lesson header for points
                                                                                        const currentLesson = (subjectLessons[selectedSubjectId] || []).find(l => l.id === lesson.id);
                                                                                        if (currentLesson) {
                                                                                            startEditingLesson(lesson.id, currentLesson.type, currentLesson.points || 0, true);
                                                                                            toast.success('Lesson points editing activated');
                                                                                        }
                                                                                    }
                                                                                    else if (lessonPointsRef.current && selectedLesson) {
                                                                                        lessonPointsRef.current.focus();
                                                                                        lessonPointsRef.current.select();
                                                                                        toast.success('Lesson points selected');
                                                                                    }
                                                                                }
                                                                                else if (e.key === 'Delete' && existingGrade) {
                                                                                    e.preventDefault();
                                                                                    deleteGrade(student.id, lesson.id);
                                                                                    setEditingCell(null);
                                                                                }
                                                                                else if (e.key === 'ArrowUp') {
                                                                                    e.preventDefault();
                                                                                    // Save current cell before navigating
                                                                                    await saveGradeInline(student.id, lesson.id, false);
                                                                                    navigateToCell('up', student.id, lesson.id);
                                                                                }
                                                                                else if (e.key === 'ArrowDown') {
                                                                                    e.preventDefault();
                                                                                    // Save current cell before navigating
                                                                                    await saveGradeInline(student.id, lesson.id, false);
                                                                                    navigateToCell('down', student.id, lesson.id);
                                                                                }
                                                                                else if (e.key === 'ArrowLeft') {
                                                                                    e.preventDefault();
                                                                                    // Save current cell before navigating
                                                                                    await saveGradeInline(student.id, lesson.id, false);
                                                                                    navigateToCell('left', student.id, lesson.id);
                                                                                }
                                                                                else if (e.key === 'ArrowRight') {
                                                                                    e.preventDefault();
                                                                                    // Save current cell before navigating
                                                                                    await saveGradeInline(student.id, lesson.id, false);
                                                                                    navigateToCell('right', student.id, lesson.id);
                                                                                }
                                                                                else if (e.key === 'PageUp') {
                                                                                    e.preventDefault();
                                                                                    if (displayedStudents.length > 0) {
                                                                                        const firstStudent = displayedStudents[0];
                                                                                        const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === lesson.id);
                                                                                        const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                                                                                        const currentValue = existingGrade
                                                                                            ? (isSkipped ? 'S' : (entryMode === 'percentage'
                                                                                                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                                                                                                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                                                                            : '';
                                                                                        startEditingGrade(firstStudent.id, lesson.id, currentValue);
                                                                                        toast.success('Jumped to first student');
                                                                                    }
                                                                                }
                                                                                else if (e.key === 'PageDown') {
                                                                                    e.preventDefault();
                                                                                    if (displayedStudents.length > 0) {
                                                                                        const lastStudent = displayedStudents[displayedStudents.length - 1];
                                                                                        const existingGrade = grades.find(g => g.studentId === lastStudent.id && g.lessonId === lesson.id);
                                                                                        const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                                                                                        const currentValue = existingGrade
                                                                                            ? (isSkipped ? 'S' : (entryMode === 'percentage'
                                                                                                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                                                                                                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                                                                            : '';
                                                                                        startEditingGrade(lastStudent.id, lesson.id, currentValue);
                                                                                        toast.success('Jumped to last student');
                                                                                    }
                                                                                }
                                                                            }, onBlur: () => {
                                                                                // Auto-save on blur if value changed
                                                                                if (tempGradeValue !== (existingGrade
                                                                                    ? (isSkipped ? 'S' : (entryMode === 'percentage' ? (existingGrade.percentage || 0).toString() : (existingGrade.errors || 0).toString()))
                                                                                    : '')) {
                                                                                    saveGradeInline(student.id, lesson.id, false);
                                                                                }
                                                                                else {
                                                                                    setEditingCell(null);
                                                                                }
                                                                            } }) })) : existingGrade ? (_jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: `inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getGradeColor(displayPercentage, isSkipped)}`, children: isSkipped ? 'SKIP' : `${formatPercentage(typeof displayPercentage === 'number' ? displayPercentage : 0)}%` }), _jsx("div", { className: "text-xs text-muted-foreground", children: displayValue })] })) : (_jsx("div", { className: "text-muted-foreground text-sm", children: "-" })) }, lesson.id));
                                                            })] }, student.id)))] }, groupName))) })] }) })), _jsxs("div", { className: "mt-6 p-4 bg-muted/30 rounded-lg", children: [_jsx("h4", { className: "font-medium mb-3", children: "Grade Color Legend" }), _jsxs("div", { className: "flex flex-wrap gap-4 text-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-4 h-4 rounded bg-green-100 border border-green-200" }), _jsx("span", { children: "90%+ (Excellent)" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-4 h-4 rounded bg-blue-100 border border-blue-200" }), _jsx("span", { children: "70-89% (Good)" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-4 h-4 rounded bg-red-100 border border-red-200" }), _jsx("span", { children: "Below 70% (Needs Improvement)" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-4 h-4 rounded bg-gray-100 border border-gray-200" }), _jsx("span", { children: "Skipped" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-4 h-4 rounded bg-blue-50 border-2 border-blue-200" }), _jsx("span", { children: "Non-lesson columns (Tests, Reviews, etc.)" })] })] }), _jsx("p", { className: "text-xs text-muted-foreground mt-2", children: "Click any grade cell to edit inline \u2022 Use arrow keys to navigate \u2022 Enter saves and moves to next cell \u2022 Click lesson headers to edit properties \u2022 F2 switches between entry/table modes" })] })] })] })) : (_jsxs("div", { className: "grid gap-6 lg:grid-cols-4", children: [_jsx("div", { className: "lg:col-span-3", children: _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs(CardTitle, { children: ["Students (", enrolledStudents.length, ")"] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Switch, { checked: entryMode === 'errors', onCheckedChange: (checked) => setEntryMode(checked ? 'errors' : 'percentage'), id: "entry-mode" }), _jsxs(Label, { htmlFor: "entry-mode", className: "sr-only", children: [entryMode === 'errors' ? 'Errors' : 'Percentage', " mode"] }), entryMode === 'errors' && (_jsxs(Badge, { variant: "outline", className: "text-xs", children: [_jsx(X, { size: 12, className: "mr-1" }), "Errors"] })), entryMode === 'percentage' && (_jsxs(Badge, { variant: "outline", className: "text-xs", children: [_jsx(Percent, { size: 12, className: "mr-1" }), "Percentage"] }))] }), _jsxs("div", { className: "hidden md:flex items-center gap-2 text-sm text-muted-foreground", children: [_jsx(Keyboard, { size: 16 }), "Enhanced keyboard navigation"] }), _jsxs("div", { className: "md:hidden flex items-center gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                                                        if (currentLessonIndex > 0) {
                                                                            const prevLesson = filteredSubjectLessons[currentLessonIndex - 1];
                                                                            setSelectedLessonId(prevLesson.id);
                                                                            toast.success(`Switched to ${prevLesson.name}`);
                                                                        }
                                                                    }, disabled: currentLessonIndex <= 0, className: "px-2", children: "\u2039" }), _jsxs("span", { className: "text-xs text-muted-foreground", children: [currentLessonIndex + 1, " / ", filteredSubjectLessons.length] }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                                                        if (currentLessonIndex < filteredSubjectLessons.length - 1) {
                                                                            const nextLesson = filteredSubjectLessons[currentLessonIndex + 1];
                                                                            setSelectedLessonId(nextLesson.id);
                                                                            toast.success(`Switched to ${nextLesson.name}`);
                                                                        }
                                                                    }, disabled: currentLessonIndex >= filteredSubjectLessons.length - 1, className: "px-2", children: "\u203A" }), _jsx("div", { className: "mx-2 h-4 w-px bg-border" }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                                                        if (currentSubjectIndex > 0) {
                                                                            const prevSubject = availableSubjects[currentSubjectIndex - 1];
                                                                            setSelectedSubjectId(prevSubject.id);
                                                                            setSelectedLessonId('');
                                                                            toast.success(`Switched to ${prevSubject.name}`);
                                                                        }
                                                                    }, disabled: currentSubjectIndex <= 0, className: "px-2", children: "\u00AB" }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                                                        if (currentSubjectIndex < availableSubjects.length - 1) {
                                                                            const nextSubject = availableSubjects[currentSubjectIndex + 1];
                                                                            setSelectedSubjectId(nextSubject.id);
                                                                            setSelectedLessonId('');
                                                                            toast.success(`Switched to ${nextSubject.name}`);
                                                                        }
                                                                    }, disabled: currentSubjectIndex >= availableSubjects.length - 1, className: "px-2", children: "\u00BB" })] })] })] }), loadingInitialData ? (_jsx("div", { className: "p-3 mb-2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-sm", children: "Loading data..." })) : students.length === 0 ? (_jsxs("div", { className: "p-3 mb-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm", children: ["No students found. Please add students before proceeding.", _jsx("br", {}), _jsx("button", { className: "underline text-blue-700 hover:text-blue-900 font-medium mt-2", type: "button", onClick: goToStudentsAndAddStudent, children: "Add Student \u2192" })] })) : subjects.length === 0 ? (_jsxs("div", { className: "p-3 mb-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm", children: ["No subjects found. Please add subjects before proceeding.", _jsx("br", {}), _jsx("button", { className: "underline text-blue-700 hover:text-blue-900 font-medium mt-2", type: "button", onClick: goToSubjectsAndAddSubject, children: "Add Subject \u2192" })] })) : availableSubjects.length === 0 ? (_jsxs("div", { className: "p-3 mb-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm", children: ["No subjects available for grade entry.", _jsx("br", {}), "Please activate subjects for students on the ", _jsx("b", { children: "Students" }), " tab by clicking the appropriate subject buttons for each student.", _jsx("button", { className: "underline text-blue-700 hover:text-blue-900 font-medium mt-2 block", type: "button", onClick: () => goToTab('students'), children: "Go to Students \u2192" })] })) : selectedSubject && (!subjectLessons[selectedSubjectId] || subjectLessons[selectedSubjectId].length === 0) && !loadingLessons[selectedSubjectId] && (_jsxs("div", { className: "p-3 mb-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm", children: ["No lessons found for this subject. Please add lessons before proceeding.", _jsx("br", {}), "You can use ", _jsx("b", { children: "Add Lessons" }), " to quickly add the chosen number of lessons automatically.", _jsx("br", {}), _jsx("button", { className: "underline text-blue-700 hover:text-blue-900 font-medium mt-2", type: "button", onClick: () => goToSubjectsAndHighlight(selectedSubjectId, 'add-lesson'), children: "Add Lessons \u2192" })] })), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "grade-entry-subject-select", className: "text-sm font-medium", children: "Subject" }), _jsxs(Select, { open: subjectSelectOpen, onOpenChange: setSubjectSelectOpen, value: selectedSubjectId, onValueChange: (subjectId) => {
                                                                setSelectedSubjectId(subjectId);
                                                                // Clear lesson selection so auto-selection logic will run
                                                                setSelectedLessonId("");
                                                                setSubjectSelectOpen(false);
                                                            }, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select subject" }) }), _jsx(SelectContent, { position: "item-aligned", children: availableSubjects.map((subject) => (_jsx(SelectItem, { value: subject.id, children: subject.name }, subject.id))) })] })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "grade-entry-lesson-select", className: "text-sm font-medium", children: "Lesson" }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Select, { value: selectedLessonId, onValueChange: (lessonId) => {
                                                                        const lesson = subjectLessons[selectedSubjectId]?.find(l => l.id === lessonId);
                                                                        if (lesson) {
                                                                            setSelectedLessonId(lessonId);
                                                                        }
                                                                    }, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select lesson" }) }), _jsx(SelectContent, { children: filteredSubjectLessons.map(lesson => {
                                                                                const gradingStatus = getLessonGradingStatus(lesson.id);
                                                                                const getStatusColor = () => {
                                                                                    switch (gradingStatus) {
                                                                                        case 'complete': return 'text-green-700';
                                                                                        case 'partial': return 'text-orange-600';
                                                                                        default: return 'text-gray-600';
                                                                                    }
                                                                                };
                                                                                const getStatusBadge = () => {
                                                                                    switch (gradingStatus) {
                                                                                        case 'complete': return 'border-green-300 bg-green-50';
                                                                                        case 'partial': return 'border-orange-300 bg-orange-50';
                                                                                        default: return '';
                                                                                    }
                                                                                };
                                                                                const getGradedBadge = () => {
                                                                                    switch (gradingStatus) {
                                                                                        case 'complete': return { bg: 'bg-green-100', text: 'text-green-800', label: '✓ Complete' };
                                                                                        case 'partial': return { bg: 'bg-orange-100', text: 'text-orange-800', label: '⚠ Partial' };
                                                                                        default: return null;
                                                                                    }
                                                                                };
                                                                                return (_jsx(SelectItem, { value: lesson.id, children: _jsxs("div", { className: `flex items-center gap-2 ${getStatusColor()}`, children: [_jsx("span", { className: gradingStatus !== 'none' ? 'font-medium' : '', children: lesson.name }), _jsx(Badge, { className: `text-xs text-white border-0 ${gradingStatus !== 'none' ? 'opacity-90' : ''}`, style: { backgroundColor: getCategoryColor(lesson) }, children: lesson.type }), _jsxs(Badge, { variant: "outline", className: `text-xs ${getStatusBadge()}`, children: [lesson.points, "pts"] }), (() => {
                                                                                                const badge = getGradedBadge();
                                                                                                return badge ? (_jsx(Badge, { variant: "secondary", className: `text-xs ${badge.bg} ${badge.text}`, children: badge.label })) : null;
                                                                                            })()] }) }, lesson.id));
                                                                            }) })] }, `lesson-select-${selectedSubjectId}-${(subjectLessons[selectedSubjectId] || []).length}-${window.SELECTED_TEACHER_GROUPS?.join(',') || 'all'}`), selectedSubjectId && (_jsxs(_Fragment, { children: [selectedLessonId && (_jsx(Button, { size: "icon", variant: "ghost", onClick: () => {
                                                                                const lesson = subjectLessons[selectedSubjectId]?.find(l => l.id === selectedLessonId);
                                                                                if (lesson) {
                                                                                    editLesson(lesson, selectedSubjectId);
                                                                                }
                                                                            }, title: "Edit Lesson", className: "shrink-0", children: _jsx(PencilSimple, { className: "h-4 w-4" }) })), _jsx(Button, { size: "icon", variant: "ghost", onClick: addLessonAfterSelected, title: "Add New Lesson After This One", className: "shrink-0", children: _jsx(Plus, { className: "h-4 w-4" }) })] }))] })] })] }), _jsxs("div", { className: `flex items-center gap-2 p-3 rounded-lg ${(entryMode === 'errors' && (!selectedLesson?.points || selectedLesson.points <= 0))
                                                ? 'bg-yellow-100 border border-yellow-300'
                                                : 'bg-muted/30'}`, children: [_jsxs(Label, { className: "text-sm font-medium", children: ["Points for this lesson:", (!selectedLesson?.points || selectedLesson.points <= 0) && (_jsx("span", { className: "text-red-600 ml-1", children: "*Required for errors mode" }))] }), _jsx(Input, { ref: lessonPointsRef, type: "number", value: lessonPoints, onChange: (e) => setLessonPoints(e.target.value), onFocus: (e) => e.target.select(), onKeyDown: (e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (!selectedLesson)
                                                                return;
                                                            const newPoints = parseFloat(lessonPoints);
                                                            const isTableMode = activeView === 'table';
                                                            const currentSelectedLessonId = selectedLessonId;
                                                            // Function to focus first student based on mode
                                                            const focusFirstStudent = () => {
                                                                if (displayedStudents.length > 0) {
                                                                    if (isTableMode && currentSelectedLessonId) {
                                                                        // Table view: start editing first student in current lesson
                                                                        const firstStudent = displayedStudents[0];
                                                                        const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === currentSelectedLessonId);
                                                                        const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                                                                        const currentValue = existingGrade
                                                                            ? (isSkipped ? 'S' : (entryMode === 'percentage'
                                                                                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '')
                                                                                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                                                            : '';
                                                                        startEditingGrade(firstStudent.id, currentSelectedLessonId, currentValue);
                                                                    }
                                                                    else {
                                                                        // Entry view: focus first input
                                                                        const firstStudentId = displayedStudents[0].id;
                                                                        const firstInput = inputRefs.current[firstStudentId];
                                                                        if (firstInput) {
                                                                            firstInput.focus();
                                                                            // Auto-select the text if there's a value
                                                                            if (firstInput.value) {
                                                                                setTimeout(() => firstInput.select(), 0);
                                                                            }
                                                                            setFocusedCell({ row: 0, col: 0 });
                                                                        }
                                                                    }
                                                                }
                                                            };
                                                            if (!isNaN(newPoints) && newPoints > 0 && newPoints !== selectedLesson.points) {
                                                                updateLessonPoints(newPoints).then(() => {
                                                                    focusFirstStudent();
                                                                });
                                                            }
                                                            else {
                                                                // If no change needed, still jump back to first student
                                                                focusFirstStudent();
                                                            }
                                                        }
                                                    }, onBlur: () => {
                                                        if (!selectedLesson)
                                                            return;
                                                        const newPoints = parseFloat(lessonPoints);
                                                        if (!isNaN(newPoints) && newPoints > 0 && newPoints !== selectedLesson.points) {
                                                            updateLessonPoints(newPoints);
                                                        }
                                                    }, className: `w-20 ${(entryMode === 'errors' && (!selectedLesson?.points || selectedLesson.points <= 0))
                                                        ? 'border-yellow-400 focus:border-yellow-500'
                                                        : ''}`, min: "1", step: "1", placeholder: placeholderValue, disabled: !selectedLesson }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                                        if (!selectedLesson)
                                                            return;
                                                        const newPoints = parseFloat(lessonPoints);
                                                        if (!isNaN(newPoints) && newPoints > 0 && newPoints !== selectedLesson.points) {
                                                            updateLessonPoints(newPoints);
                                                        }
                                                    }, disabled: !selectedLesson, children: "Update" })] })] }), _jsx(CardContent, { children: enrolledStudents.length === 0 ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "No students enrolled in this subject" })) : (_jsxs("div", { ref: gridRef, className: "space-y-2", children: [selectedLesson && entryMode === 'errors' && (!selectedLesson.points || selectedLesson.points <= 0) && (_jsxs("div", { className: "p-3 mb-4 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm", children: [_jsx("strong", { children: "\u26A0\uFE0F Missing Lesson Points:" }), " Lesson points are required for errors mode and skipping grades. You can still enter grades in percentage mode without setting points."] })), _jsxs("div", { className: "grid grid-cols-12 gap-4 p-3 text-sm font-medium text-muted-foreground border-b border-border", children: [_jsx("div", { className: "col-span-5", children: "Student" }), _jsxs("div", { className: "col-span-3", children: [entryMode === 'errors' ? 'Errors' : 'Grade', entryMode === 'errors' && selectedLesson ? ` (/${selectedLesson.points})` : entryMode === 'percentage' ? ' (0-100 or A, B+, etc.)' : ''] }), _jsx("div", { className: "col-span-2", children: "Preview" }), _jsx("div", { className: "col-span-2", children: "Status" })] }), groupedEnrolledStudents.map(({ groupName, students: groupStudents }) => (_jsxs("div", { className: "space-y-2", children: [_jsx("h4", { className: "text-lg font-semibold px-3 py-2 bg-muted/20 rounded-md border-l-4 border-primary", children: groupName }), groupStudents.map((student) => {
                                                        const globalIndex = displayedStudentIndex.get(student.id) ?? -1;
                                                        const currentValue = gradeValues[student.id] || '';
                                                        let displayPercentage = 0;
                                                        // Calculate percentage based on entry mode
                                                        if (currentValue && selectedLesson) {
                                                            if (currentValue.toLowerCase() === 's') {
                                                                displayPercentage = 0; // Skip shows as 0% but will be marked as skipped
                                                            }
                                                            else {
                                                                const letterPercentage = processLetterGrade(currentValue);
                                                                if (letterPercentage !== null) {
                                                                    displayPercentage = roundToNearestHalf(letterPercentage);
                                                                }
                                                                else {
                                                                    const fractionPoints = processFractionEntry(currentValue, selectedLessonId);
                                                                    if (fractionPoints !== null) {
                                                                        const maxPoints = parseFloat(currentValue.split('/')[1]);
                                                                        displayPercentage = roundToNearestHalf(((fractionPoints / maxPoints) * 100));
                                                                    }
                                                                    else {
                                                                        const numericValue = parseFloat(currentValue);
                                                                        if (!isNaN(numericValue)) {
                                                                            if (entryMode === 'errors') {
                                                                                const points = selectedLesson?.points ? selectedLesson.points - numericValue : 0;
                                                                                displayPercentage = selectedLesson?.points ? roundToNearestHalf(((points / selectedLesson.points) * 100)) : 0;
                                                                            }
                                                                            else {
                                                                                // Direct percentage entry - round to nearest 0.5%
                                                                                displayPercentage = roundToNearestHalf(numericValue);
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        const existingGrade = grades.find(g => g.studentId === student.id && g.lessonId === selectedLessonId);
                                                        return (_jsxs("div", { className: `grid grid-cols-12 gap-4 p-3 rounded-lg border transition-colors ${focusedCell?.row === globalIndex ? 'bg-primary/5 border-primary' : 'bg-card border-border'}`, children: [_jsx("div", { className: "col-span-5 flex items-center", children: _jsx("div", { children: _jsx("p", { className: "font-medium", children: student.name }) }) }), _jsx("div", { className: "col-span-3", children: _jsx(Input, { ref: el => {
                                                                            if (el)
                                                                                inputRefs.current[student.id] = el;
                                                                        }, type: "text", value: currentValue, onChange: (e) => updateGradeValue(student.id, e.target.value), onBlur: () => saveGrade(student.id), onKeyDown: (e) => handleKeyNavigation(e, student.id, globalIndex), onFocus: (e) => {
                                                                            setFocusedCell({ row: globalIndex, col: 0 });
                                                                            e.target.select();
                                                                        }, className: "grade-cell font-medium tabular-nums", placeholder: entryMode === 'errors' ? '# of errors' : '%, A, B+, S(skip)' }) }), _jsx("div", { className: "col-span-2 flex items-center", children: currentValue ? (currentValue.toLowerCase() === 's' ? (_jsx(Badge, { variant: "outline", className: "text-xs", children: "SKIP" })) : !isNaN(displayPercentage) ? (_jsxs(Badge, { variant: displayPercentage >= 90 ? "default" : displayPercentage >= 70 ? "secondary" : "destructive", children: [formatPercentage(typeof displayPercentage === 'number' && !isNaN(displayPercentage) ? displayPercentage : 0), "%"] })) : (_jsx("span", { className: "text-muted-foreground text-sm", children: "-" }))) : (_jsx("span", { className: "text-muted-foreground text-sm", children: "-" })) }), _jsx("div", { className: "col-span-2 flex items-center gap-2", children: existingGrade ? (_jsxs(_Fragment, { children: [(() => {
                                                                                // Use stored values directly from database
                                                                                const percentage = existingGrade.percentage || 0;
                                                                                const errors = existingGrade.errors || 0;
                                                                                const maxPoints = existingGrade.maxPoints || existingGrade.points || 0;
                                                                                const isSkipped = percentage === 0 && errors === maxPoints;
                                                                                return isSkipped ? (_jsx(Badge, { variant: "outline", className: "text-xs", children: "Skipped" })) : (_jsx(Badge, { variant: "outline", className: "text-xs", children: "Saved" }));
                                                                            })(), _jsx(Button, { size: "sm", variant: "ghost", className: "h-6 w-6 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground", onClick: () => deleteGrade(student.id, selectedLessonId), title: "Delete grade", children: _jsx(Trash, { size: 12 }) })] })) : currentValue ? (_jsx(Badge, { variant: "secondary", className: "text-xs", children: "Unsaved" })) : (_jsx("span", { className: "text-muted-foreground text-sm", children: "Empty" })) })] }, student.id));
                                                    })] }, groupName)))] })) })] }) }), _jsxs("div", { className: "space-y-6", children: [selectedLesson && (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-lg", children: "Lesson Info" }) }), _jsxs(CardContent, { className: "space-y-3", children: [_jsxs("div", { children: [_jsx(Label, { className: "text-sm", children: "Type" }), _jsx(Badge, { className: "ml-2 capitalize text-white border-0", style: { backgroundColor: getCategoryColor(selectedLesson) }, children: selectedLesson.type })] }), _jsxs("div", { children: [_jsx(Label, { className: "text-sm", children: "Max Points" }), _jsx("p", { className: "font-medium", children: selectedLesson.points || selectedLesson.maxPoints })] }), selectedLesson.dueDate && (_jsxs("div", { children: [_jsx(Label, { className: "text-sm", children: "Due Date" }), _jsx("p", { className: "font-medium", children: new Date(selectedLesson.dueDate).toLocaleDateString() })] })), _jsxs("div", { children: [_jsx(Label, { className: "text-sm", children: "Entry Mode" }), _jsx("p", { className: "font-medium", children: entryMode === 'errors' ? 'Errors (out of ' + (selectedLesson.points || selectedLesson.maxPoints) + ')' : 'Percentage (0-100)' })] })] })] })), _jsxs(Card, { className: "hidden md:block", children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { className: "text-lg", children: "Keyboard Shortcuts" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Most shortcuts work globally - no need to focus inputs first!" })] }), _jsxs(CardContent, { className: "space-y-2 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Next student" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "\u2193 / Enter" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Previous student" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "\u2191" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "First student" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "PageUp" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Last student" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "PageDown" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Next lesson" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "\u2192" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Previous lesson" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "\u2190" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Next subject" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "Shift+\u2193" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Previous subject" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "Shift+\u2191" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Switch entry mode" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "F1" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Switch view mode" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "F2" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Skip lesson" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "S" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Edit lesson points" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "Space" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Save current grade" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "Tab / Blur" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Exit focus" }), _jsx(Badge, { variant: "outline", className: "text-xs", children: "Esc" })] })] })] })] })] })), _jsx(Dialog, { open: editLessonDialog.open, onOpenChange: v => { if (!v)
                    closeEditLessonDialog(); }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Edit Lesson" }) }), editLessonDialog.lesson && (_jsx("form", { onSubmit: e => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                handleEditLessonSave({
                                    name: formData.get('name'),
                                    type: formData.get('type'), // Allow any custom grade category type
                                    points: parseInt(formData.get('points')) || 0
                                });
                            }, children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "edit-lesson-name", children: "Name" }), _jsx(Input, { id: "edit-lesson-name", name: "name", defaultValue: editLessonDialog.lesson.name, onFocus: (e) => e.target.select() })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "edit-lesson-type", children: "Type" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("select", { id: "edit-lesson-type", name: "type", defaultValue: editLessonDialog.lesson.type, className: "flex-1 border rounded px-2 py-1", children: gradeCategoryTypes.map(categoryType => (_jsx("option", { value: categoryType.name, children: categoryType.name }, categoryType.id))) }), _jsx("div", { className: "w-4 h-4 rounded-full border border-gray-300", style: { backgroundColor: getCategoryColor(editLessonDialog.lesson) }, title: `Color for ${editLessonDialog.lesson.type}` })] })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "edit-lesson-points", children: "Points" }), _jsx(Input, { id: "edit-lesson-points", name: "points", type: "number", defaultValue: editLessonDialog.lesson.points, onFocus: (e) => e.target.select() })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { type: "button", variant: "outline", onClick: closeEditLessonDialog, children: "Cancel" }), _jsx(Button, { type: "submit", children: "Save Changes" })] })] }) }))] }) })] }));
}
