import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash, X, CaretDown, CaretUp, PencilSimple, Upload } from "@phosphor-icons/react";
import { apiClient } from '@/lib/api';
function Subjects() {
    // Helper function to get default weights for categories (only active ones)
    const getDefaultWeights = () => {
        const defaultWeights = {};
        const activeCategories = gradeCategoryTypes.filter(category => category.is_active !== false);
        // Initialize all active categories to 0
        activeCategories.forEach(category => {
            defaultWeights[category.id] = 0;
        });
        // Helper function to normalize names for comparison
        const normalizeName = (name) => name.toLowerCase().replace(/[\s\-_]/g, '');
        // Find homework-like category for 34% weight
        let homeworkCategory = activeCategories.find(cat => normalizeName(cat.name) === 'homework');
        if (!homeworkCategory) {
            homeworkCategory = activeCategories.find(cat => ['lesson', 'normal'].includes(normalizeName(cat.name)));
        }
        if (!homeworkCategory) {
            // Find first category that's not test/quiz/project/participation
            const excludeNames = ['test', 'tests', 'quiz', 'quizzes', 'project', 'projects', 'participation'];
            homeworkCategory = activeCategories.find(cat => !excludeNames.includes(normalizeName(cat.name)));
        }
        // Find test-like category for 66% weight
        let testCategory = activeCategories.find(cat => ['test', 'tests'].includes(normalizeName(cat.name)));
        // Assign weights
        if (homeworkCategory) {
            defaultWeights[homeworkCategory.id] = 34;
        }
        if (testCategory && testCategory.id !== homeworkCategory?.id) {
            defaultWeights[testCategory.id] = 66;
        }
        else if (!testCategory && activeCategories.length > 1) {
            // If no test category found, give 66% to the last active category (if different from homework)
            const lastCategory = activeCategories[activeCategories.length - 1];
            if (lastCategory.id !== homeworkCategory?.id) {
                defaultWeights[lastCategory.id] = 66;
            }
        }
        return defaultWeights;
    };
    // Function to open add dialog with proper initialization
    const openAddSubjectDialog = () => {
        setNewSubject({
            name: '',
            report_card_name: '',
            weights: getDefaultWeights()
        });
        setSelectedGroups([]);
        setIsEditing(false);
        setEditingSubjectId(null);
        setIsAddDialogOpen(true);
    };
    // Edit subject handler - now actually opens the edit dialog
    function handleEditSubject(subjectId) {
        const subject = subjects.find(s => s.id === subjectId);
        if (!subject) {
            toast.error("Subject not found");
            return;
        }
        // Build weights object from subject data
        const weights = {};
        gradeCategoryTypes.forEach(category => {
            // Use the new weights structure from the backend
            const weight = subject.weights?.[category.id] || 0;
            // Set weight to 0 for disabled categories
            weights[category.id] = category.is_active === false ? 0 : Math.round(weight * 100); // Convert decimal to percentage (0.34 -> 34)
        });
        // Populate the form with current subject data
        setNewSubject({
            name: subject.name,
            report_card_name: subject.report_card_name || '',
            weights
        });
        // Set selected groups from the subject's group_name
        const groups = subject.group_name ? subject.group_name.split(',').map((g) => g.trim()) : [];
        setSelectedGroups(groups);
        // Set editing state
        setIsEditing(true);
        setEditingSubjectId(subjectId);
        setIsAddDialogOpen(true);
    }
    // Show/hide lessons for a subject
    const showLessons = (subjectId) => expandedSubjects[subjectId] || false;
    // Store lessons per subjectId
    const [subjectLessons, setSubjectLessons] = useState({});
    const [loadingLessons, setLoadingLessons] = useState({});
    const [subjectMarkers, setSubjectMarkers] = useState({});
    const toggleLessons = async (subjectId) => {
        setExpandedSubjects(prev => {
            const next = { ...prev, [subjectId]: !prev[subjectId] };
            return next;
        });
        // If opening and lessons not loaded, fetch them
        if (!showLessons(subjectId) && !subjectLessons[subjectId]) {
            setLoadingLessons(prev => ({ ...prev, [subjectId]: true }));
            const [lessonsRes, markersRes] = await Promise.all([
                apiClient.getLessonsForSubject(subjectId),
                apiClient.getGradingPeriodMarkersForSubject(subjectId)
            ]);
            setSubjectLessons(prev => ({ ...prev, [subjectId]: Array.isArray(lessonsRes.data) ? lessonsRes.data : [] }));
            setSubjectMarkers(prev => ({ ...prev, [subjectId]: Array.isArray(markersRes.data) ? markersRes.data : [] }));
            setLoadingLessons(prev => ({ ...prev, [subjectId]: false }));
        }
    };
    // Add or update subject handler
    async function handleSubmitSubject() {
        if (!newSubject.name.trim()) {
            toast.error("Subject name is required");
            return;
        }
        // Validate that grade weights total 100%
        const totalWeight = Object.values(newSubject.weights).reduce((sum, weight) => sum + (weight || 0), 0);
        if (totalWeight !== 100) {
            toast.error(`Grade weights must total exactly 100%. Current total: ${totalWeight}%`);
            return;
        }
        try {
            const payload = {
                name: newSubject.name.trim()
            };
            // Only include report_card_name if it's not empty
            const reportCardName = newSubject.report_card_name.trim();
            if (reportCardName) {
                payload.report_card_name = reportCardName;
            }
            // Add weights object for the new structure (only include active categories)
            const weights = {};
            gradeCategoryTypes.forEach(category => {
                if (category.is_active !== false) {
                    const weight = newSubject.weights[category.id] || 0;
                    weights[category.id] = Number(weight) / 100 || 0; // Convert percentage to decimal (0-1)
                }
            });
            payload.weights = weights;
            // Convert selected group names to group IDs
            if (selectedGroups.length > 0) {
                const groupIds = studentGroups
                    .filter(group => selectedGroups.includes(group.name))
                    .map(group => group.id);
                payload.groupIds = groupIds;
            }
            if (isEditing && editingSubjectId) {
                await apiClient.updateSubject(editingSubjectId, payload);
                toast.success("Subject updated");
            }
            else {
                await apiClient.createSubject(payload);
                toast.success("Subject added");
            }
            const res = await apiClient.getSubjects();
            setSubjects(Array.isArray(res.data) ? res.data : []);
            // reset form and state
            setNewSubject({
                name: '',
                report_card_name: '',
                weights: getDefaultWeights()
            });
            setSelectedGroups([]);
            setIsAddDialogOpen(false);
            setIsEditing(false);
            setEditingSubjectId(null);
        }
        catch (err) {
            console.error("Failed to save subject", err);
            toast.error("Failed to save subject");
        }
    }
    // Remove subject handler
    async function handleRemoveSubject(subjectId) {
        if (!window.confirm('Are you sure you want to delete this subject? This will also delete all lessons and grades associated with it. This action cannot be undone.')) {
            return;
        }
        try {
            await apiClient.deleteSubject(subjectId);
            // Remove the subject from the local state
            setSubjects(prevSubjects => prevSubjects.filter(subject => subject.id !== subjectId));
            // Also remove any cached lessons for this subject
            setSubjectLessons(prev => {
                const updated = { ...prev };
                delete updated[subjectId];
                return updated;
            });
            toast.success('Subject deleted successfully');
        }
        catch (error) {
            toast.error('Failed to delete subject');
            console.error('Error deleting subject:', error);
        }
    }
    const [editLessonDialog, setEditLessonDialog] = useState({ open: false, lesson: null, subjectId: null });
    function editLesson(lesson, subjectId) {
        setEditLessonDialog({ open: true, lesson, subjectId });
    }
    async function handleEditLessonSave(updated) {
        if (!editLessonDialog.lesson || !editLessonDialog.subjectId)
            return;
        try {
            await apiClient.updateLesson(editLessonDialog.lesson.id, updated);
            // Close dialog immediately to prevent stale data display
            setEditLessonDialog({ open: false, lesson: null, subjectId: null });
            // Refresh lessons for this subject
            const subjectId = String(editLessonDialog.subjectId);
            const res = await apiClient.getLessonsForSubject(subjectId);
            setSubjectLessons(prev => ({ ...prev, [subjectId]: Array.isArray(res.data) ? res.data : [] }));
            toast.success('Lesson updated');
        }
        catch (err) {
            console.error('Error in handleEditLessonSave:', err);
            toast.error('Failed to update lesson');
        }
    }
    function closeEditLessonDialog() {
        setEditLessonDialog({ open: false, lesson: null, subjectId: null });
    }
    async function handleDeleteLesson(subjectId, lessonId) {
        if (!window.confirm('Are you sure you want to delete this lesson? This will also delete all grades associated with this lesson. This action cannot be undone.'))
            return;
        try {
            await apiClient.deleteLesson(lessonId);
            // Refresh BOTH lessons and markers (order indices were shifted by backend)
            const [lessonsRes, markersRes] = await Promise.all([
                apiClient.getLessonsForSubject(subjectId),
                apiClient.getGradingPeriodMarkersForSubject(subjectId)
            ]);
            const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
            const markers = Array.isArray(markersRes.data) ? markersRes.data : [];
            console.log('📚 Lessons after delete:', lessons.map((l) => ({ id: l.id, name: l.name, order_index: l.order_index })));
            console.log('📍 Markers after delete:', markers.map((m) => ({ id: m.id, name: m.name, order_index: m.order_index })));
            setSubjectLessons(prev => ({ ...prev, [subjectId]: lessons }));
            setSubjectMarkers(prev => ({ ...prev, [subjectId]: markers }));
            // Update the lesson count in the subjects array
            setSubjects(prevSubjects => prevSubjects.map(subject => subject.id === subjectId
                ? { ...subject, lesson_count: (subject.lesson_count || 0) - 1 }
                : subject));
            toast.success('Lesson deleted');
        }
        catch (err) {
            toast.error('Failed to delete lesson');
        }
    }
    // Insert a lesson directly below the clicked one
    async function insertLessonAt(subjectId, afterOrderIndex) {
        try {
            const lessons = subjectLessons[subjectId] || [];
            const categoryTypes = await apiClient.getGradeCategoryTypes();
            const defaultCategory = Array.isArray(categoryTypes.data)
                ? categoryTypes.data.find(c => c.is_default) || categoryTypes.data[0]
                : null;
            if (!defaultCategory) {
                toast.error('No grade categories found. Please create categories first.');
                return;
            }
            let orderIndex;
            let lessonNumber;
            let lessonPoints = 100; // Default
            if (afterOrderIndex === 0) {
                // Creating the first lesson
                orderIndex = 1;
                lessonNumber = 1;
            }
            else {
                // Find the lesson with this order_index (cast to any for snake_case property access)
                const lessonAtPosition = lessons.find(l => l.order_index === afterOrderIndex);
                if (!lessonAtPosition) {
                    toast.error('Cannot find lesson to insert after');
                    return;
                }
                // The new lesson should go at the position right after this lesson
                orderIndex = afterOrderIndex + 1;
                lessonNumber = orderIndex;
                // Copy points from the lesson we're inserting after
                lessonPoints = lessonAtPosition.points || 100;
                // Try to extract number from the lesson name (e.g., "Lesson 15" -> 15)
                if (lessonAtPosition.name) {
                    const match = lessonAtPosition.name.match(/(\d+)$/);
                    if (match) {
                        lessonNumber = parseInt(match[1], 10) + 1;
                    }
                }
            }
            // Create the lesson using the backend endpoint that handles shifting automatically
            await apiClient.createLesson(subjectId, `${lessonPrefix} ${lessonNumber}`, defaultCategory.id, lessonPoints, orderIndex);
            // Refresh BOTH lessons and markers (order indices were shifted by backend)
            const [finalRes, markersRes] = await Promise.all([
                apiClient.getLessonsForSubject(subjectId),
                apiClient.getGradingPeriodMarkersForSubject(subjectId)
            ]);
            const finalLessons = Array.isArray(finalRes.data) ? finalRes.data : [];
            setSubjectLessons(prev => ({ ...prev, [subjectId]: finalLessons }));
            setSubjectMarkers(prev => ({ ...prev, [subjectId]: Array.isArray(markersRes.data) ? markersRes.data : [] }));
            // Update the lesson count in the subjects array
            setSubjects(prevSubjects => prevSubjects.map(subject => subject.id === subjectId
                ? { ...subject, lesson_count: finalLessons.length }
                : subject));
            toast.success('Lesson inserted');
        }
        catch (err) {
            console.error('Failed to insert lesson:', err);
            toast.error('Failed to insert lesson');
        }
    }
    function handleAutoGenDialog(subjectId) {
        openAddLessonDialog(subjectId);
    }
    // Insert a grading period marker at the specified position
    async function insertGradingPeriodMarker(subjectId, orderIndex) {
        try {
            const gradingPeriods = userProfile?.grading_periods || 6;
            const maxMarkers = gradingPeriods - 1; // For N periods, you need N-1 markers
            const currentMarkers = subjectMarkers[subjectId] || [];
            if (currentMarkers.length >= maxMarkers) {
                toast.error(`Cannot add more grading period markers. Your grading periods setting (${gradingPeriods}) allows a maximum of ${maxMarkers} markers per subject.`);
                return;
            }
            await apiClient.createGradingPeriodMarker(subjectId, undefined, orderIndex);
            // Refresh BOTH markers and lessons (lessons were shifted by backend)
            const [markersRes, lessonsRes] = await Promise.all([
                apiClient.getGradingPeriodMarkersForSubject(subjectId),
                apiClient.getLessonsForSubject(subjectId)
            ]);
            let markers = Array.isArray(markersRes.data) ? markersRes.data : [];
            // Renumber markers
            for (let i = 0; i < markers.length; i++) {
                const newName = `End of Grading Period ${i + 1}`;
                if (markers[i].name !== newName) {
                    await apiClient.updateGradingPeriodMarker(markers[i].id, newName, markers[i].order_index);
                    markers[i].name = newName;
                }
            }
            setSubjectMarkers(prev => ({ ...prev, [subjectId]: markers }));
            setSubjectLessons(prev => ({ ...prev, [subjectId]: Array.isArray(lessonsRes.data) ? lessonsRes.data : [] }));
            toast.success('Grading period marker added');
        }
        catch (err) {
            console.error('Failed to add grading period marker:', err);
            toast.error('Failed to add grading period marker');
        }
    }
    // Delete a grading period marker
    async function deleteGradingPeriodMarker(subjectId, markerId) {
        if (!window.confirm('Are you sure you want to delete this grading period marker?'))
            return;
        try {
            await apiClient.deleteGradingPeriodMarker(markerId);
            // Refresh BOTH markers and lessons (lessons were shifted by backend)
            const [markersRes, lessonsRes] = await Promise.all([
                apiClient.getGradingPeriodMarkersForSubject(subjectId),
                apiClient.getLessonsForSubject(subjectId)
            ]);
            let markers = Array.isArray(markersRes.data) ? markersRes.data : [];
            // Renumber markers
            for (let i = 0; i < markers.length; i++) {
                const newName = `End of Grading Period ${i + 1}`;
                if (markers[i].name !== newName) {
                    await apiClient.updateGradingPeriodMarker(markers[i].id, newName, markers[i].order_index);
                    markers[i].name = newName;
                }
            }
            setSubjectMarkers(prev => ({ ...prev, [subjectId]: markers }));
            setSubjectLessons(prev => ({ ...prev, [subjectId]: Array.isArray(lessonsRes.data) ? lessonsRes.data : [] }));
            toast.success('Grading period marker deleted');
        }
        catch (err) {
            console.error('Failed to delete grading period marker:', err);
            toast.error('Failed to delete grading period marker');
        }
    }
    // Shift a marker up or down by swapping order_index with adjacent lesson
    async function shiftMarker(subjectId, marker, direction) {
        try {
            const lessons = subjectLessons[subjectId] || [];
            const markers = subjectMarkers[subjectId] || [];
            // Get combined and sorted items
            // Use 'itemType' to distinguish between lessons and markers, not 'type' (which is the category name)
            const combinedItems = [
                ...lessons.map((l) => ({ ...l, itemType: 'lesson' })),
                ...markers.map((m) => ({ ...m, itemType: 'marker' }))
            ].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            // Find the current marker's position in combined array
            const currentIndex = combinedItems.findIndex((item) => item.itemType === 'marker' && item.id === marker.id);
            if (currentIndex === -1) {
                toast.error('Marker not found');
                return;
            }
            // Find the adjacent lesson to swap with
            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= combinedItems.length) {
                toast.error(`Cannot move marker ${direction}`);
                return;
            }
            const targetItem = combinedItems[targetIndex];
            // Only swap with lessons, not other markers
            if (targetItem.itemType !== 'lesson') {
                toast.error(`Can only swap with lessons`);
                return;
            }
            // Swap the order_index values
            const markerOrderIndex = marker.order_index;
            const lessonOrderIndex = targetItem.order_index;
            // Update both items
            await Promise.all([
                apiClient.updateGradingPeriodMarker(marker.id, marker.name, lessonOrderIndex),
                apiClient.updateLesson(targetItem.id, { orderIndex: markerOrderIndex })
            ]);
            // Refresh both datasets
            const [markersRes, lessonsRes] = await Promise.all([
                apiClient.getGradingPeriodMarkersForSubject(subjectId),
                apiClient.getLessonsForSubject(subjectId)
            ]);
            setSubjectMarkers(prev => ({
                ...prev,
                [subjectId]: Array.isArray(markersRes.data) ? markersRes.data : []
            }));
            setSubjectLessons(prev => ({
                ...prev,
                [subjectId]: Array.isArray(lessonsRes.data) ? lessonsRes.data : []
            }));
            toast.success(`Marker moved ${direction}`);
        }
        catch (err) {
            console.error('Failed to shift marker:', err);
            toast.error('Failed to shift marker');
        }
    }
    const [subjects, setSubjects] = useState([]);
    const [filteredSubjects, setFilteredSubjects] = useState([]);
    const [studentGroups, setStudentGroups] = useState([]);
    const [gradeCategoryTypes, setGradeCategoryTypes] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState([]);
    const [showGroupDropdown, setShowGroupDropdown] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [showNewGroupInput, setShowNewGroupInput] = useState(false);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingSubjectId, setEditingSubjectId] = useState(null);
    const [newSubject, setNewSubject] = useState({
        name: '',
        report_card_name: '',
        weights: {}
    });
    // Helper function to get category color from lesson object or type name
    const getCategoryColor = (lesson) => {
        // First try to use the type_color field from the API response
        if (lesson.type_color) {
            return lesson.type_color;
        }
        // Fallback to looking up by type name
        const categoryType = gradeCategoryTypes.find(cat => cat.name === lesson.type);
        return categoryType?.color || '#6366f1'; // Default color
    };
    const [expandedSubjects, setExpandedSubjects] = useState({});
    const [addLessonDialog, setAddLessonDialog] = useState({ open: false, subjectId: null });
    const [lessonReplacementDialog, setLessonReplacementDialog] = useState({ open: false, subjectId: null, existingCount: 0 });
    const [lessonCount, setLessonCount] = useState(1);
    const [lessonPrefix, setLessonPrefix] = useState('Lesson');
    const [lessonType, setLessonType] = useState('lesson');
    const [lessonPoints, setLessonPoints] = useState(100);
    const [addMarkerDialog, setAddMarkerDialog] = useState({ open: false, subjectId: null, desiredOrderIndex: null, selectedOptionIdx: null });
    const [userProfile, setUserProfile] = useState(null);
    const [bulkMarkerAdding, setBulkMarkerAdding] = useState(false);
    const gradingMode = (userProfile === null || userProfile === void 0 ? void 0 : userProfile.grading_mode) === 'markers' ? 'markers' : 'dates';
    const isDateMode = gradingMode === 'dates';
    // Helper function to extract grade number from group name for sorting
    const extractGradeNumber = (groupName) => {
        const match = groupName.match(/Grade\s+(\d+)/i);
        return match ? parseInt(match[1], 10) : 999; // Put non-grade groups at the end
    };
    // Helper function to get the first group from a subject's group_name
    const getFirstGroup = (groupName) => {
        if (!groupName)
            return 'No Group';
        return groupName.split(',')[0].trim();
    };
    // Helper function to group and sort subjects by their first group
    const groupAndSortSubjects = (subjects) => {
        // Group subjects by their first group
        const grouped = subjects.reduce((acc, subject) => {
            const firstGroup = getFirstGroup(subject.group_name);
            if (!acc[firstGroup]) {
                acc[firstGroup] = [];
            }
            acc[firstGroup].push(subject);
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
        // Return sorted groups with their subjects (also sorted by name)
        return sortedGroupNames.map(groupName => ({
            groupName,
            subjects: grouped[groupName].sort((a, b) => a.name.localeCompare(b.name))
        }));
    };
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
    const handleInsertMarkersAfterLastGraded = useCallback(async () => {
        if (bulkMarkerAdding)
            return;
        if (!filteredSubjects || filteredSubjects.length === 0) {
            toast.info('No subjects available for the current teacher');
            return;
        }
        const confirmed = window.confirm('Insert the next grading period marker after the last graded lesson for each visible subject?');
        if (!confirmed)
            return;
        setBulkMarkerAdding(true);
        const maxMarkersPerSubject = Math.max((userProfile?.grading_periods || 6) - 1, 0);
        let added = 0;
        let skipped = 0;
        for (const subject of filteredSubjects) {
            try {
                const [lessonsRes, markersRes, gradesRes] = await Promise.all([
                    apiClient.getLessonsForSubject(subject.id),
                    apiClient.getGradingPeriodMarkersForSubject(subject.id),
                    apiClient.getGradesForSubject(subject.id)
                ]);
                const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
                const markers = Array.isArray(markersRes.data) ? markersRes.data : [];
                const grades = Array.isArray(gradesRes.data) ? gradesRes.data : [];
                if (markers.length >= maxMarkersPerSubject) {
                    skipped += 1;
                    continue;
                }
                const lessonById = new Map(lessons.map((l) => [l.id, l]));
                let highestOrder = -1;
                grades.forEach((g) => {
                    const lesson = lessonById.get(g.lessonId);
                    if (!lesson)
                        return;
                    const orderIndex = lesson.order_index ?? lesson.orderIndex ?? 0;
                    if (orderIndex > highestOrder) {
                        highestOrder = orderIndex;
                    }
                });
                if (highestOrder === -1) {
                    skipped += 1;
                    continue;
                }
                const insertAt = highestOrder + 1;
                const createRes = await apiClient.createGradingPeriodMarker(subject.id, undefined, insertAt);
                if (createRes?.error) {
                    skipped += 1;
                    continue;
                }
                const [updatedMarkersRes, updatedLessonsRes] = await Promise.all([
                    apiClient.getGradingPeriodMarkersForSubject(subject.id),
                    apiClient.getLessonsForSubject(subject.id)
                ]);
                let updatedMarkers = Array.isArray(updatedMarkersRes.data) ? updatedMarkersRes.data : [];
                for (let i = 0; i < updatedMarkers.length; i++) {
                    const desiredName = `End of Grading Period ${i + 1}`;
                    if (updatedMarkers[i].name !== desiredName) {
                        await apiClient.updateGradingPeriodMarker(updatedMarkers[i].id, desiredName, updatedMarkers[i].order_index);
                        updatedMarkers[i].name = desiredName;
                    }
                }
                setSubjectMarkers(prev => ({ ...prev, [subject.id]: updatedMarkers }));
                setSubjectLessons(prev => ({ ...prev, [subject.id]: Array.isArray(updatedLessonsRes.data) ? updatedLessonsRes.data : [] }));
                added += 1;
            }
            catch (err) {
                console.error('Failed to insert grading period marker after last graded lesson', err);
                skipped += 1;
            }
        }
        setBulkMarkerAdding(false);
        if (added > 0) {
            toast.success(`Inserted markers for ${added} subject${added === 1 ? '' : 's'}${skipped > 0 ? `; skipped ${skipped}` : ''}`);
        }
        else {
            toast.info(skipped > 0 ? `No markers added; skipped ${skipped} subject${skipped === 1 ? '' : 's'}` : 'No markers added');
        }
    }, [bulkMarkerAdding, filteredSubjects, userProfile]);
    // Update lesson type when categories are loaded
    useEffect(() => {
        if (gradeCategoryTypes.length > 0) {
            setLessonType(gradeCategoryTypes[0].name.toLowerCase());
        }
    }, [gradeCategoryTypes]);
    // Calculate total weight for validation (only include active categories)
    const totalWeight = gradeCategoryTypes
        .filter(category => category.is_active !== false)
        .reduce((sum, category) => sum + (newSubject.weights[category.id] || 0), 0);
    // Fetch subjects and student groups from API on mount
    useEffect(() => {
        async function fetchData() {
            try {
                const [subjectsRes, groupsRes, categoriesRes, profileRes] = await Promise.all([
                    apiClient.getSubjects(),
                    apiClient.getStudentGroups(),
                    apiClient.getGradeCategoryTypes(),
                    apiClient.getProfile()
                ]);
                setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : []);
                setStudentGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
                // Handle nested data structure for categories
                const categoriesData = Array.isArray(categoriesRes.data?.data) ? categoriesRes.data.data :
                    Array.isArray(categoriesRes.data) ? categoriesRes.data : [];
                setGradeCategoryTypes(categoriesData);
                setUserProfile(profileRes.data || null);
            }
            catch (e) {
                setSubjects([]);
                setStudentGroups([]);
                setGradeCategoryTypes([]);
                setUserProfile(null);
            }
        }
        fetchData();
    }, []);
    // Filter data when teacher selection changes or data is updated
    useEffect(() => {
        filterSubjectsByTeacherGroups();
    }, [subjects, studentGroups]);
    // Listen for teacher selection changes
    useEffect(() => {
        const handleTeacherChange = () => {
            filterSubjectsByTeacherGroups();
        };
        window.addEventListener('teacher-selection-changed', handleTeacherChange);
        return () => {
            window.removeEventListener('teacher-selection-changed', handleTeacherChange);
        };
    }, [filterSubjectsByTeacherGroups]);
    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showGroupDropdown) {
                const target = event.target;
                if (!target.closest('.group-dropdown-container')) {
                    setShowGroupDropdown(false);
                    setShowNewGroupInput(false);
                    setNewGroupName('');
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showGroupDropdown]);
    // Listen for expand and highlight requests from other components
    useEffect(() => {
        const handleExpandAndHighlight = (event) => {
            const { subjectId, action } = event.detail;
            // Expand the subject if it's not already expanded
            const isCurrentlyExpanded = expandedSubjects[subjectId];
            if (!isCurrentlyExpanded) {
                toggleLessons(subjectId);
            }
            // Scroll to subject after a brief delay
            setTimeout(() => {
                const subjectElement = document.querySelector(`[data-subject-id="${subjectId}"]`);
                if (subjectElement) {
                    subjectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight the appropriate button based on action
                    if (action === 'add-marker') {
                        if (isDateMode)
                            return;
                        const addMarkerButton = subjectElement.querySelector('[data-action="add-marker"]');
                        if (addMarkerButton) {
                            addMarkerButton.classList.add('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2');
                            setTimeout(() => {
                                addMarkerButton.classList.remove('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2');
                            }, 3000);
                        }
                    }
                    else if (action === 'add-lesson') {
                        // Highlight both "Add Lesson" and "Add Lessons" buttons
                        const addLessonButton = subjectElement.querySelector('[data-action="add-lesson"]');
                        const addLessonsButton = subjectElement.querySelector('[data-action="add-lessons"]');
                        if (addLessonButton) {
                            addLessonButton.classList.add('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
                            setTimeout(() => {
                                addLessonButton.classList.remove('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
                            }, 3000);
                        }
                        if (addLessonsButton) {
                            addLessonsButton.classList.add('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
                            setTimeout(() => {
                                addLessonsButton.classList.remove('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
                            }, 3000);
                        }
                    }
                }
            }, 200);
        };
        window.addEventListener('gradeflow-subjects-expand-and-highlight', handleExpandAndHighlight);
        return () => window.removeEventListener('gradeflow-subjects-expand-and-highlight', handleExpandAndHighlight);
    }, [expandedSubjects, toggleLessons]);
    // Listen for general highlight action (for top-level buttons like Add Subject)
    useEffect(() => {
        const handleHighlightAction = (event) => {
            const { action } = event.detail;
            setTimeout(() => {
                const button = document.querySelector(`[data-action="${action}"]`);
                if (button) {
                    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    button.classList.add('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
                    setTimeout(() => {
                        button.classList.remove('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
                    }, 3000);
                }
            }, 200);
        };
        window.addEventListener('gradeflow-subjects-highlight-action', handleHighlightAction);
        return () => window.removeEventListener('gradeflow-subjects-highlight-action', handleHighlightAction);
    }, []);
    // Group selection handlers
    const toggleGroup = (groupName) => {
        setSelectedGroups(prev => prev.includes(groupName)
            ? prev.filter(g => g !== groupName)
            : [...prev, groupName]);
    };
    const createNewGroup = async () => {
        if (!newGroupName.trim())
            return;
        try {
            const newGroup = { name: newGroupName.trim() };
            await apiClient.createStudentGroup(newGroup);
            // Refresh student groups
            const groupsRes = await apiClient.getStudentGroups();
            setStudentGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
            // Add the new group to selected groups
            setSelectedGroups(prev => [...prev, newGroupName.trim()]);
            // Reset form
            setNewGroupName('');
            setShowNewGroupInput(false);
            toast.success('Group created and added');
        }
        catch (error) {
            toast.error('Failed to create group');
        }
    };
    function openAddLessonDialog(subjectId) {
        setAddLessonDialog({ open: true, subjectId });
        setLessonCount(1);
    }
    function closeAddLessonDialog() {
        setAddLessonDialog({ open: false, subjectId: null });
    }
    function openAddMarkerDialog(subjectId, insertAfterOrderIndex) {
        const desiredOrderIndex = insertAfterOrderIndex !== null ? insertAfterOrderIndex + 1 : null;
        // Find the option index that matches this orderIndex
        let selectedOptionIdx = null;
        if (desiredOrderIndex !== null) {
            const lessons = subjectLessons[subjectId] ?? [];
            const markers = subjectMarkers[subjectId] ?? [];
            const combinedItems = [
                ...lessons.map(item => ({ ...item, itemType: 'lesson' })),
                ...markers.map(item => ({ ...item, itemType: 'marker' }))
            ].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            const options = [
                { label: 'At the beginning', value: 1 },
                ...combinedItems.map((item) => ({
                    label: `After ${item.itemType === 'marker' ? item.name : item.name}`,
                    value: (item.order_index ?? 0) + 1
                })),
                { label: 'At the end', value: Math.max(...combinedItems.map((item) => item.order_index ?? 0), 0) + 1 }
            ];
            selectedOptionIdx = options.findIndex(opt => opt.value === desiredOrderIndex);
            if (selectedOptionIdx === -1)
                selectedOptionIdx = null;
        }
        setAddMarkerDialog({ open: true, subjectId, desiredOrderIndex, selectedOptionIdx });
    }
    function closeAddMarkerDialog() {
        setAddMarkerDialog({ open: false, subjectId: null, desiredOrderIndex: null, selectedOptionIdx: null });
    }
    function closeLessonReplacementDialog() {
        setLessonReplacementDialog({ open: false, subjectId: null, existingCount: 0 });
    }
    async function addLessonsToSubject(subjectId, replaceExisting) {
        try {
            const existingLessons = subjectLessons[subjectId] || [];
            if (replaceExisting) {
                // Delete all existing lessons first
                for (const lesson of existingLessons) {
                    await apiClient.deleteLesson(lesson.id);
                }
            }
            // Add new lessons - backend will automatically continue numbering from existing lessons
            await apiClient.addLessonsToSubject(subjectId, lessonCount, lessonPrefix, lessonType, lessonPoints);
            // Always refetch lessons for this subject to update the UI
            const subjectIdStr = String(subjectId);
            setLoadingLessons(prev => ({ ...prev, [subjectIdStr]: true }));
            const res = await apiClient.getLessonsForSubject(subjectIdStr);
            const newLessonsData = Array.isArray(res.data) ? res.data : [];
            setSubjectLessons(prev => ({ ...prev, [subjectIdStr]: newLessonsData }));
            setLoadingLessons(prev => ({ ...prev, [subjectIdStr]: false }));
            // Update the lesson count in the subjects array
            setSubjects(prevSubjects => prevSubjects.map(subject => subject.id === subjectId
                ? { ...subject, lesson_count: newLessonsData.length }
                : subject));
            closeAddLessonDialog();
            closeLessonReplacementDialog();
            toast.success(replaceExisting ? 'Lessons replaced successfully' : 'Lesson(s) added successfully');
        }
        catch (err) {
            toast.error('Failed to add/replace lesson(s)');
        }
    }
    async function handleReplaceLessons() {
        if (!lessonReplacementDialog.subjectId)
            return;
        await addLessonsToSubject(lessonReplacementDialog.subjectId, true);
    }
    async function handleContinueLessons() {
        if (!lessonReplacementDialog.subjectId)
            return;
        await addLessonsToSubject(lessonReplacementDialog.subjectId, false);
    }
    async function handleAddLessonSubmit() {
        if (!addLessonDialog.subjectId)
            return;
        try {
            const subjectId = addLessonDialog.subjectId;
            const existingLessons = subjectLessons[subjectId] || [];
            const hasExistingLessons = existingLessons.length > 0;
            // If subject already has lessons, show replacement options dialog
            if (hasExistingLessons) {
                setLessonReplacementDialog({ open: true, subjectId, existingCount: existingLessons.length });
                return;
            }
            // No existing lessons, proceed directly
            await addLessonsToSubject(subjectId, false);
        }
        catch (err) {
            toast.error('Failed to add lessons');
        }
    }
    const bulkImport = async (event) => {
        const file = event.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const csv = e.target?.result;
                const lines = csv.split('\n').filter(line => line.trim());
                if (lines.length === 0) {
                    toast.error("CSV file is empty");
                    return;
                }
                // Skip header row and parse data
                const subjectsData = [];
                const errors = [];
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim());
                    // Validate that required fields are provided (Name is required, Group and Report Card Name are optional)
                    if (values.length < 1) {
                        errors.push(`Row ${i + 1}: Missing subject name`);
                        continue;
                    }
                    const name = values[0];
                    const group = values[1] || ''; // Optional
                    const reportCardName = values[2] || ''; // Optional
                    // Check for empty required fields
                    if (!name) {
                        errors.push(`Row ${i + 1}: Subject name is required`);
                        continue;
                    }
                    subjectsData.push({
                        name: name,
                        group: group,
                        reportCardName: reportCardName
                    });
                }
                // Show errors if any
                if (errors.length > 0) {
                    toast.error(`CSV validation failed:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : ''}`);
                    return;
                }
                if (subjectsData.length === 0) {
                    toast.error("No valid subject data found in CSV");
                    return;
                }
                // Send to backend
                const result = await apiClient.bulkImportSubjects({ subjects: subjectsData });
                // Refresh the subjects list
                const subjectsRes = await apiClient.getSubjects();
                setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : []);
                toast.success(result.data?.message || `Imported ${subjectsData.length} subjects`);
            }
            catch (error) {
                console.error('Import error:', error);
                toast.error(error.response?.data?.error || "Failed to import CSV file");
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-bold text-foreground", children: "Subjects" }), _jsx("p", { className: "text-muted-foreground", children: "Manage subjects and lessons" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Label, { htmlFor: "subjects-csv-upload", className: "cursor-pointer", children: _jsx(Button, { variant: "outline", asChild: true, children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Upload, { size: 16 }), "Import CSV"] }) }) }) }), _jsx(TooltipContent, { children: _jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "font-medium mb-1", children: "CSV Format:" }), _jsxs("div", { className: "text-xs text-muted-foreground", children: [_jsx("div", { children: "Column 1: Subject Name (required)" }), _jsx("div", { children: "Column 2: Group (optional)" }), _jsx("div", { children: "Column 3: Report Card Name (optional)" })] }), _jsx("div", { className: "mt-2 text-xs text-blue-600", children: "Groups will be created automatically if they don't exist" })] }) })] }) }), !isDateMode && _jsx(Button, { variant: "outline", onClick: handleInsertMarkersAfterLastGraded, disabled: bulkMarkerAdding, children: bulkMarkerAdding ? 'Inserting markers...' : 'Insert next markers' }), _jsx("input", { id: "subjects-csv-upload", type: "file", accept: ".csv", className: "hidden", onChange: bulkImport }), _jsxs(Button, { variant: "default", onClick: openAddSubjectDialog, "data-action": "add-subject", children: [_jsx(Plus, { size: 16, className: "mr-2" }), " Add Subject"] })] })] }), _jsx(Dialog, { open: isAddDialogOpen, onOpenChange: (open) => {
                            setIsAddDialogOpen(open);
                            if (!open) {
                                setShowGroupDropdown(false);
                                setShowNewGroupInput(false);
                                setNewGroupName('');
                            }
                        }, children: _jsxs(DialogContent, { "aria-describedby": "add-subject-desc", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: isEditing ? 'Edit Subject' : 'Add New Subject' }) }), _jsx("div", { id: "add-subject-desc", className: "text-muted-foreground text-sm mt-1 mb-2", children: "Enter a subject name and (optionally) a group. This helps organize your curriculum." }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "subject-name", children: "Name *" }), _jsx(Input, { id: "subject-name", value: newSubject.name, onChange: e => setNewSubject(prev => ({ ...prev, name: e.target.value })), placeholder: "Subject name", "aria-describedby": "add-subject-desc" })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "subject-report-name", children: "Report Card Name" }), _jsx(Input, { id: "subject-report-name", value: newSubject.report_card_name, onChange: e => setNewSubject(prev => ({ ...prev, report_card_name: e.target.value })), placeholder: "Name to appear on report cards (optional)" }), _jsx("div", { className: "text-xs text-muted-foreground mt-1", children: "If blank, the subject name will be used on report cards" })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "subject-group", children: "Groups" }), _jsxs("div", { className: "relative group-dropdown-container", children: [_jsxs("div", { className: "flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", onClick: () => setShowGroupDropdown(!showGroupDropdown), children: [_jsx("div", { className: "flex flex-wrap gap-1 flex-1 items-center", children: selectedGroups.length === 0 ? (_jsx("span", { className: "text-muted-foreground", children: "Select groups (optional)" })) : (selectedGroups.map((group, index) => (_jsxs(Badge, { variant: "secondary", className: "text-xs flex items-center gap-1", children: [group, _jsx(X, { size: 12, className: "cursor-pointer hover:text-destructive", onClick: (e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedGroups(prev => prev.filter(g => g !== group));
                                                                                } })] }, index)))) }), _jsx(CaretDown, { size: 16, className: "text-muted-foreground" })] }), showGroupDropdown && (_jsxs("div", { className: "absolute z-50 w-full mt-1 bg-background border border-input rounded-md shadow-lg max-h-60 overflow-y-auto", children: [studentGroups.map((group) => (_jsxs("div", { className: "flex items-center space-x-2 px-3 py-2 hover:bg-accent cursor-pointer", onClick: () => toggleGroup(group.name), children: [_jsx(Checkbox, { checked: selectedGroups.includes(group.name), onChange: () => { } }), _jsx("span", { className: "text-sm", children: group.name })] }, group.id))), showNewGroupInput ? (_jsx("div", { className: "px-3 py-2 border-t", children: _jsxs("div", { className: "flex gap-2", children: [_jsx(Input, { value: newGroupName, onChange: (e) => setNewGroupName(e.target.value), placeholder: "New group name", className: "flex-1", autoFocus: true, onKeyPress: (e) => {
                                                                                    if (e.key === 'Enter') {
                                                                                        createNewGroup();
                                                                                    }
                                                                                } }), _jsx(Button, { size: "sm", onClick: createNewGroup, disabled: !newGroupName.trim(), children: "Add" }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => {
                                                                                    setShowNewGroupInput(false);
                                                                                    setNewGroupName('');
                                                                                }, children: "Cancel" })] }) })) : (_jsxs("div", { className: "flex items-center space-x-2 px-3 py-2 hover:bg-accent cursor-pointer border-t", onClick: () => setShowNewGroupInput(true), children: [_jsx(Plus, { size: 16 }), _jsx("span", { className: "text-sm text-muted-foreground", children: "Add new group" })] }))] }))] })] }), _jsxs("div", { children: [_jsx(Label, { children: "Grade Weights (%)" }), gradeCategoryTypes.length === 0 ? (_jsxs("div", { className: "mt-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg", children: [_jsxs("div", { className: "flex items-center gap-2 text-yellow-800 mb-2", children: [_jsx("svg", { className: "w-5 h-5", fill: "currentColor", viewBox: "0 0 20 20", children: _jsx("path", { fillRule: "evenodd", d: "M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z", clipRule: "evenodd" }) }), _jsx("span", { className: "font-medium", children: "No Grade Categories Available" })] }), _jsx("p", { className: "text-sm text-yellow-700 mb-3", children: "You need to set up grade category types before creating subjects. Categories define how different types of assignments (lessons, tests, projects, etc.) are weighted in your gradebook." }), _jsx("div", { className: "flex gap-2", children: _jsx(Button, { size: "sm", variant: "outline", onClick: () => {
                                                                    // Dispatch custom event to navigate to admin settings
                                                                    window.dispatchEvent(new CustomEvent('gradeflow-admin-goto-settings'));
                                                                    setIsAddDialogOpen(false);
                                                                }, className: "bg-white border-yellow-300 text-yellow-800 hover:bg-yellow-50", children: "Set Up Categories" }) })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid grid-cols-2 gap-2 mt-2", children: gradeCategoryTypes.map((category) => (_jsxs("div", { className: category.is_active === false ? 'opacity-50' : '', children: [_jsxs(Label, { htmlFor: `${category.id}Weight`, className: category.is_active === false ? 'text-muted-foreground' : '', children: [category.name, category.is_active === false && _jsx("span", { className: "text-xs ml-1", children: "(disabled)" })] }), _jsx(Input, { id: `${category.id}Weight`, type: "number", min: 0, max: 100, value: category.is_active === false ? 0 : (newSubject.weights[category.id] || 0), onChange: e => {
                                                                            if (category.is_active === false)
                                                                                return; // Prevent editing disabled categories
                                                                            setNewSubject(prev => ({
                                                                                ...prev,
                                                                                weights: {
                                                                                    ...prev.weights,
                                                                                    [category.id]: Number(e.target.value)
                                                                                }
                                                                            }));
                                                                        }, disabled: category.is_active === false, className: category.is_active === false ? 'bg-muted cursor-not-allowed' : '' })] }, category.id))) }), _jsxs("div", { className: "mt-4 p-3 bg-muted/50 rounded-lg", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm font-medium", children: "Total Weight:" }), _jsxs("span", { className: `text-sm font-bold ${totalWeight === 100 ? 'text-green-600' : 'text-red-600'}`, children: [totalWeight, "%"] })] }), totalWeight !== 100 && (_jsx("p", { className: "text-xs text-red-600 mt-1", children: "Grade weights must total exactly 100%" }))] })] }))] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: handleSubmitSubject, className: "flex-1", disabled: gradeCategoryTypes.length === 0 || totalWeight !== 100, children: isEditing ? 'Save Changes' : _jsxs(_Fragment, { children: [_jsx(Plus, { size: 16, className: "mr-2" }), " Add Subject"] }) }), _jsx(Button, { variant: "outline", onClick: () => {
                                                        setIsAddDialogOpen(false);
                                                        setIsEditing(false);
                                                        setEditingSubjectId(null);
                                                        setShowGroupDropdown(false);
                                                        setShowNewGroupInput(false);
                                                        setNewGroupName('');
                                                        // Reset form to defaults
                                                        setNewSubject({
                                                            name: '',
                                                            report_card_name: '',
                                                            weights: getDefaultWeights()
                                                        });
                                                        setSelectedGroups([]);
                                                    }, children: "Cancel" })] })] })] }) }), filteredSubjects.length === 0 ? (_jsx(Card, { children: _jsxs(CardContent, { className: "py-12 text-center", children: [_jsx(Plus, { size: 48, className: "mx-auto text-muted-foreground mb-4" }), _jsx("h3", { className: "text-lg font-medium mb-2", children: "No subjects yet" }), _jsx("p", { className: "text-muted-foreground mb-4", children: "Add your first subject to get started" }), _jsxs(Button, { onClick: openAddSubjectDialog, children: [_jsx(Plus, { size: 16, className: "mr-2" }), " Add Subject"] })] }) })) : (_jsx("div", { className: "space-y-8", children: groupAndSortSubjects(filteredSubjects).map(({ groupName, subjects: groupSubjects }) => (_jsxs("div", { children: [_jsx("h3", { className: "text-xl font-semibold mb-4 pb-2 border-b", children: groupName }), _jsx("div", { className: "space-y-4", children: groupSubjects.map((subject) => (_jsxs(Card, { className: "relative group", "data-subject-id": subject.id, children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "flex-1", children: [_jsxs(CardTitle, { className: "text-xl cursor-pointer select-none", onClick: () => toggleLessons(subject.id), children: [subject.name, _jsxs("span", { className: "ml-2 text-xs text-muted-foreground", children: ["(", subject.lesson_count ?? 0, " lessons)"] }), _jsx("span", { className: "ml-2 text-xs", children: showLessons(subject.id) ? '▲' : '▼' })] }), _jsx("div", { className: "flex items-center gap-4 mt-1", children: subject.group_name && (_jsx("div", { className: "flex gap-1 flex-wrap", children: subject.group_name.split(',').map((group, index) => (_jsx(Badge, { variant: "outline", className: "text-xs", children: group.trim() }, index))) })) })] }), showLessons(subject.id) && (_jsxs("div", { className: "flex gap-2 mx-4", children: [_jsxs(Button, { size: "sm", variant: "outline", onClick: () => {
                                                                        const lessons = subjectLessons[subject.id] || [];
                                                                        if (lessons.length === 0) {
                                                                            // If no lessons exist, create the first lesson at position 1
                                                                            insertLessonAt(subject.id, 0); // This will create lesson at order_index 1
                                                                            return;
                                                                        }
                                                                        const lastLesson = lessons[lessons.length - 1];
                                                                        insertLessonAt(subject.id, lastLesson.order_index);
                                                                    }, "data-action": "add-lesson", children: [_jsx(Plus, { size: 14, className: "mr-1 text-primary" }), " Add Lesson"] }), !isDateMode && _jsx(Button, { size: "sm", variant: "outline", onClick: () => openAddMarkerDialog(subject.id, null), "data-action": "add-marker", children: "\uD83D\uDCCD Add Marker" }), _jsx(Button, { size: "sm", variant: "secondary", onClick: () => handleAutoGenDialog(subject.id), "data-action": "add-lessons", children: "Add Lessons" })] })), _jsxs("div", { className: "flex gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleEditSubject(subject.id), children: _jsx(PencilSimple, { size: 16 }) }), _jsxs(AlertDialog, { children: [_jsx(AlertDialogTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "sm", children: _jsx(Trash, { size: 16, className: "text-destructive" }) }) }), _jsxs(AlertDialogContent, { children: [_jsxs(AlertDialogHeader, { children: [_jsx(AlertDialogTitle, { children: "Delete Subject" }), _jsxs(AlertDialogDescription, { children: ["Are you sure you want to delete ", _jsx("strong", { children: subject.name }), "? This action cannot be undone and will permanently remove the subject and all associated lessons."] })] }), _jsxs(AlertDialogFooter, { children: [_jsx(AlertDialogCancel, { children: "Cancel" }), _jsx(AlertDialogAction, { onClick: () => handleRemoveSubject(subject.id), className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", children: "Delete Subject" })] })] })] })] })] }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { className: "text-sm font-medium", children: "Grade Weights" }), _jsx("div", { className: "flex flex-wrap gap-2 mt-2", children: (() => {
                                                                    const weightBadges = gradeCategoryTypes
                                                                        .map(category => {
                                                                        // Use the new weights structure from the backend
                                                                        const value = subject.weights?.[category.id];
                                                                        return {
                                                                            key: category.id,
                                                                            value: value,
                                                                            label: category.name
                                                                        };
                                                                    })
                                                                        .filter(item => item.value && item.value > 0)
                                                                        .map((item) => (_jsxs(Badge, { variant: "outline", className: "capitalize", children: [item.label, ": ", Math.round(Number(item.value) * 100), "%"] }, item.key)));
                                                                    // If no weights are set, show a warning message
                                                                    if (weightBadges.length === 0) {
                                                                        return (_jsx(Badge, { variant: "destructive", className: "text-sm", children: "Please specify grading weights" }));
                                                                    }
                                                                    return weightBadges;
                                                                })() })] }), showLessons(subject.id) && (_jsx("div", { className: "mt-4 max-h-60 overflow-y-auto border rounded bg-muted/30 p-2", children: loadingLessons[subject.id] ? (_jsx("div", { className: "text-center text-muted-foreground py-4", children: "Loading lessons..." })) : (subjectLessons[subject.id]?.length ?? 0) === 0 && (subjectMarkers[subject.id]?.length ?? 0) === 0 ? (_jsx("div", { className: "text-center text-muted-foreground py-4", children: "No lessons yet" })) : (_jsxs("ul", { className: "space-y-2", children: [(() => {
                                                                    const lessons = subjectLessons[subject.id] ?? [];
                                                                    const markers = subjectMarkers[subject.id] ?? [];
                                                                    // Combine and sort lessons and markers by order_index
                                                                    // Use 'itemType' to distinguish between lessons and markers, not 'type' (which is the category name)
                                                                    const combinedItems = [
                                                                        ...lessons.map(item => ({ ...item, itemType: 'lesson' })),
                                                                        ...(isDateMode ? [] : markers.map(item => ({ ...item, itemType: 'marker' })))
                                                                    ].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                                                                    return combinedItems.map((item, idx) => {
                                                                        if (item.itemType === 'marker') {
                                                                            // Check if there's a lesson above or below to swap with
                                                                            const prevItem = idx > 0 ? combinedItems[idx - 1] : null;
                                                                            const nextItem = idx < combinedItems.length - 1 ? combinedItems[idx + 1] : null;
                                                                            const canMoveUp = prevItem && prevItem.itemType === 'lesson';
                                                                            const canMoveDown = nextItem && nextItem.itemType === 'lesson';
                                                                            // Render marker
                                                                            return (_jsxs("li", { className: "flex items-center gap-2 bg-red-50 border-2 border-red-200 rounded p-2 shadow-sm", children: [_jsxs("span", { className: "flex-1 font-bold text-red-800", children: ["\uD83D\uDCCD ", item.name] }), _jsx("span", { className: "text-xs px-2 py-1 bg-red-100 text-red-800 rounded border font-medium", children: "Grading Period Marker" }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => shiftMarker(subject.id, item, 'up'), disabled: !canMoveUp, title: "Move marker up", children: _jsx(CaretUp, { size: 14, className: canMoveUp ? "text-red-600" : "text-gray-300" }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => shiftMarker(subject.id, item, 'down'), disabled: !canMoveDown, title: "Move marker down", children: _jsx(CaretDown, { size: 14, className: canMoveDown ? "text-red-600" : "text-gray-300" }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => deleteGradingPeriodMarker(subject.id, item.id), title: "Delete", children: _jsx(Trash, { size: 14 }) })] }, `marker-${item.id}`));
                                                                        }
                                                                        else {
                                                                            // Render lesson
                                                                            return (_jsxs("li", { className: "flex items-center gap-2 bg-white rounded p-2 shadow-sm", children: [_jsx("span", { className: "flex-1 font-medium", children: item.name }), _jsx("span", { className: "text-xs px-2 py-1 rounded border text-white font-medium", style: { backgroundColor: getCategoryColor(item) }, children: item.type }), _jsxs("span", { className: "text-xs px-2", children: [item.points ?? item.maxPoints, " pts"] }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => insertLessonAt(subject.id, item.order_index), title: "Add a new lesson below this one", children: _jsx(Plus, { size: 14, className: "text-primary" }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => editLesson(item, subject.id), title: "Edit", children: _jsx(PencilSimple, { size: 14 }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => handleDeleteLesson(subject.id, item.id), title: "Delete", children: _jsx(Trash, { size: 14 }) })] }, item.id));
                                                                        }
                                                                    });
                                                                })(), _jsx(Dialog, { open: editLessonDialog.open, onOpenChange: v => { if (!v)
                                                                        closeEditLessonDialog(); }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Edit Lesson" }) }), editLessonDialog.lesson && (_jsxs("form", { onSubmit: e => {
                                                                                    e.preventDefault();
                                                                                    const formData = e.target;
                                                                                    const selectedTypeName = formData.type.value;
                                                                                    // Find the category ID from the name (case-insensitive comparison)
                                                                                    const selectedCategory = gradeCategoryTypes.find(cat => cat.name.toLowerCase() === selectedTypeName.toLowerCase());
                                                                                    if (!selectedCategory) {
                                                                                        toast.error('Invalid category selected');
                                                                                        return;
                                                                                    }
                                                                                    const updateData = {
                                                                                        name: formData.name.value,
                                                                                        categoryId: selectedCategory.id,
                                                                                        points: Number(formData.points.value),
                                                                                        maxPoints: Number(formData.points.value)
                                                                                    };
                                                                                    handleEditLessonSave(updateData);
                                                                                }, className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "edit-lesson-name", children: "Name" }), _jsx(Input, { id: "edit-lesson-name", name: "name", defaultValue: editLessonDialog.lesson.name })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "edit-lesson-type", children: "Type" }), _jsx("select", { id: "edit-lesson-type", name: "type", defaultValue: editLessonDialog.lesson.type.toLowerCase(), className: "w-full border rounded px-2 py-1", children: gradeCategoryTypes.map((category) => (_jsxs("option", { value: category.name.toLowerCase(), disabled: category.is_active === false, style: category.is_active === false ? { color: '#9ca3af' } : undefined, children: [category.name, category.is_active === false ? ' (disabled)' : ''] }, category.id))) })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "edit-lesson-points", children: "Points" }), _jsx(Input, { id: "edit-lesson-points", name: "points", type: "number", min: 1, max: 1000, defaultValue: editLessonDialog.lesson.points ?? editLessonDialog.lesson.maxPoints })] }), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx(Button, { type: "submit", className: "flex-1", children: "Save" }), _jsx(Button, { variant: "outline", onClick: closeEditLessonDialog, children: "Cancel" })] })] }, editLessonDialog.lesson.id))] }) })] })) }))] })] }, subject.id))) })] }, groupName))) }))] }), _jsx(Dialog, { open: addLessonDialog.open, onOpenChange: v => { if (!v)
                    closeAddLessonDialog(); }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Add Lesson(s)" }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "lesson-prefix", children: "Lesson name prefix" }), _jsx(Input, { id: "lesson-prefix", value: lessonPrefix, onChange: e => setLessonPrefix(e.target.value), placeholder: "Lesson" })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "lesson-type", children: "Lesson type" }), _jsx("select", { id: "lesson-type", value: lessonType, onChange: e => setLessonType(e.target.value), className: "w-full border rounded px-2 py-1", children: gradeCategoryTypes.map((category) => (_jsxs("option", { value: category.name.toLowerCase(), disabled: category.is_active === false, style: category.is_active === false ? { color: '#9ca3af' } : undefined, children: [category.name, category.is_active === false ? ' (disabled)' : ''] }, category.id))) })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "lesson-points", children: "Default points" }), _jsx(Input, { id: "lesson-points", type: "number", min: 1, max: 1000, value: lessonPoints, onChange: e => setLessonPoints(Number(e.target.value)) })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "lesson-count", children: "Number of lessons" }), _jsx(Input, { id: "lesson-count", type: "number", min: 1, max: 200, value: lessonCount, onChange: e => setLessonCount(Number(e.target.value)) })] }), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx(Button, { onClick: handleAddLessonSubmit, className: "flex-1", children: "Add" }), _jsx(Button, { variant: "outline", onClick: closeAddLessonDialog, children: "Cancel" })] })] })] }) }), _jsx(Dialog, { open: lessonReplacementDialog.open, onOpenChange: v => { if (!v)
                    closeLessonReplacementDialog(); }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Add Lessons" }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("p", { className: "text-muted-foreground", children: ["This subject already has ", lessonReplacementDialog.existingCount, " lesson(s). How would you like to proceed?"] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "p-3 border rounded-lg", children: [_jsx("h4", { className: "font-medium text-sm mb-1", children: "Replace All Lessons" }), _jsxs("p", { className: "text-xs text-muted-foreground mb-2", children: ["Delete all existing lessons and add ", lessonCount, " new lesson", lessonCount !== 1 ? 's' : '', " starting from 1."] }), _jsx(Button, { onClick: handleReplaceLessons, variant: "destructive", size: "sm", className: "w-full", children: "Replace All Lessons" })] }), _jsxs("div", { className: "p-3 border rounded-lg", children: [_jsx("h4", { className: "font-medium text-sm mb-1", children: "Continue from Highest Number" }), _jsxs("p", { className: "text-xs text-muted-foreground mb-2", children: ["Keep existing lessons and add ", lessonCount, " new lesson", lessonCount !== 1 ? 's' : '', " continuing from the highest current sequence number."] }), _jsx(Button, { onClick: handleContinueLessons, variant: "default", size: "sm", className: "w-full", children: "Continue Adding Lessons" })] })] }), _jsx("div", { className: "flex gap-2 pt-2", children: _jsx(Button, { variant: "outline", onClick: closeLessonReplacementDialog, className: "flex-1", children: "Cancel" }) })] })] }) }), _jsx(Dialog, { open: addMarkerDialog.open, onOpenChange: v => { if (!v)
                    closeAddMarkerDialog(); }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Add Grading Period Marker" }) }), _jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "text-muted-foreground", children: "Select where to insert the grading period marker:" }), _jsx("div", { className: "max-h-60 overflow-y-auto space-y-2", children: (() => {
                                        const lessons = subjectLessons[addMarkerDialog.subjectId || ''] ?? [];
                                        const markers = subjectMarkers[addMarkerDialog.subjectId || ''] ?? [];
                                        // Combine and sort lessons and markers by orderIndex
                                        const combinedItems = [
                                            ...lessons.map(item => ({ ...item, itemType: 'lesson' })),
                                            ...markers.map(item => ({ ...item, itemType: 'marker' }))
                                        ].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                                        const options = [
                                            { label: 'At the beginning', value: 1 },
                                            ...combinedItems.map((item) => ({
                                                label: `After ${item.itemType === 'marker' ? item.name : item.name}`,
                                                value: (item.order_index ?? 0) + 1
                                            })),
                                            { label: 'At the end', value: Math.max(...combinedItems.map((item) => item.order_index ?? 0), 0) + 1 }
                                        ];
                                        return options.map((option, idx) => (_jsx("div", { className: `p-3 border rounded cursor-pointer hover:bg-accent ${addMarkerDialog.selectedOptionIdx === idx ? 'bg-accent border-primary' : ''}`, onClick: () => setAddMarkerDialog(prev => ({ ...prev, desiredOrderIndex: option.value, selectedOptionIdx: idx })), children: _jsx("div", { className: "font-medium", children: option.label }) }, idx)));
                                    })() }), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx(Button, { onClick: () => {
                                                if (addMarkerDialog.subjectId && addMarkerDialog.desiredOrderIndex !== null) {
                                                    insertGradingPeriodMarker(addMarkerDialog.subjectId, addMarkerDialog.desiredOrderIndex);
                                                    closeAddMarkerDialog();
                                                }
                                            }, className: "flex-1", disabled: addMarkerDialog.desiredOrderIndex === null, children: "Add Marker" }), _jsx(Button, { variant: "outline", onClick: closeAddMarkerDialog, children: "Cancel" })] })] })] }) })] }));
}
export default Subjects;
