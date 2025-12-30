import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Users, BookOpen, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { toast } from 'sonner';
const attendanceStatusOptions = [
    { value: 'present', label: 'Present' },
    { value: 'tardy', label: 'Tardy' },
    { value: 'absent', label: 'Absent' },
    { value: 'excused', label: 'Excused' },
];
export default function Dashboard() {
    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [grades, setGrades] = useState([]);
    const [lessons, setLessons] = useState({});
    const [subjectMarkers, setSubjectMarkers] = useState({});
    const [studentGroups, setStudentGroups] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentGradingPeriod, setCurrentGradingPeriod] = useState(1);
    const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
    const [todayAttendanceMap, setTodayAttendanceMap] = useState({});
    const [weeklyAttendance, setWeeklyAttendance] = useState([]); // history view
    const [currentWeekAttendance, setCurrentWeekAttendance] = useState([]); // always current week for chips
    const [attendanceLoading, setAttendanceLoading] = useState(false);
    const [attendanceSaving, setAttendanceSaving] = useState(false);
    const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
    const [historySaving, setHistorySaving] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyMenuTarget, setHistoryMenuTarget] = useState(null);
    const [headerMenuDate, setHeaderMenuDate] = useState(null);
    const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = previous week, etc.
    const [selectedStudentIndex, setSelectedStudentIndex] = useState(0);
    const [teacherSelectionVersion, setTeacherSelectionVersion] = useState(0);
    const [teacherGroupIds, setTeacherGroupIds] = useState([]);
    const [averageDialogOpen, setAverageDialogOpen] = useState(false);
    const [selectedGroups, setSelectedGroups] = useState({});
    const dialogContentRef = useRef(null);
    const formatLocalISO = (d) => {
        // Local date-only string without timezone shift
        const local = new Date(d);
        local.setHours(0, 0, 0, 0);
        const year = local.getFullYear();
        const month = String(local.getMonth() + 1).padStart(2, '0');
        const day = String(local.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const parseLocalDate = (iso) => new Date(`${iso}T00:00:00`);
    const [todayIso, setTodayIso] = useState(() => formatLocalISO(new Date()));
    const isWeekendToday = useMemo(() => {
        const day = new Date().getDay();
        return day === 0 || day === 6;
    }, []);
    const refreshToday = useCallback(() => setTodayIso(formatLocalISO(new Date())), []);
    const getDaysUntilBirthday = useCallback((birthdayIso) => {
        if (!birthdayIso)
            return null;
        const parts = birthdayIso.split('-');
        if (parts.length < 3)
            return null;
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        if (isNaN(month) || isNaN(day))
            return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentYear = today.getFullYear();
        let next = new Date(currentYear, month - 1, day);
        next.setHours(0, 0, 0, 0);
        if (isNaN(next.getTime()))
            return null;
        if (next < today) {
            next = new Date(currentYear + 1, month - 1, day);
            next.setHours(0, 0, 0, 0);
        }
        const diffMs = next.getTime() - today.getTime();
        return Math.round(diffMs / (1000 * 60 * 60 * 24));
    }, []);
    const getNextBirthdayDate = useCallback((birthdayIso) => {
        if (!birthdayIso)
            return null;
        const parts = birthdayIso.split('-');
        if (parts.length < 3)
            return null;
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        if (isNaN(month) || isNaN(day))
            return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentYear = today.getFullYear();
        let next = new Date(currentYear, month - 1, day);
        next.setHours(0, 0, 0, 0);
        if (isNaN(next.getTime()))
            return null;
        if (next < today) {
            next = new Date(currentYear + 1, month - 1, day);
            next.setHours(0, 0, 0, 0);
        }
        return next;
    }, []);
    // Week helper must be defined before useMemo below
    const getWeekRange = useCallback((offset) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const day = now.getDay(); // 0 (Sun) - 6 (Sat)
        const diffToMonday = (day + 6) % 7;
        const start = new Date(now);
        start.setDate(now.getDate() - diffToMonday + offset * 7);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(0, 0, 0, 0);
        return { startDate: formatLocalISO(start), endDate: formatLocalISO(end) };
    }, []);
    const weekDates = useMemo(() => {
        const { startDate } = getWeekRange(weekOffset);
        const days = [];
        const start = parseLocalDate(startDate);
        const cursor = new Date(start);
        // Only Monday-Friday
        for (let i = 0; i < 5; i++) {
            days.push(formatLocalISO(cursor));
            cursor.setDate(cursor.getDate() + 1);
            cursor.setHours(0, 0, 0, 0);
        }
        return days;
    }, [getWeekRange, weekOffset]);
    const weekRange = useMemo(() => getWeekRange(weekOffset), [getWeekRange, weekOffset]);
    const nextBirthdayInfo = useMemo(() => {
        let closest = null;
        students.forEach(student => {
            const days = getDaysUntilBirthday(student.birthday);
            const nextDate = getNextBirthdayDate(student.birthday);
            if (days === null || !nextDate)
                return;
            if (closest === null || days < closest.daysUntil || (days === closest.daysUntil && student.name < closest.name)) {
                closest = { name: student.name, daysUntil: days, date: nextDate };
            }
        });
        return closest;
    }, [students, getDaysUntilBirthday, getNextBirthdayDate]);
    const currentWeekDates = useMemo(() => {
        const { startDate } = getWeekRange(0);
        const days = [];
        const start = parseLocalDate(startDate);
        const cursor = new Date(start);
        for (let i = 0; i < 5; i++) {
            days.push(formatLocalISO(cursor));
            cursor.setDate(cursor.getDate() + 1);
            cursor.setHours(0, 0, 0, 0);
        }
        return days;
    }, [getWeekRange]);
    const getPercentageValue = (grade) => {
        const raw = typeof grade.percentage === 'string' ? parseFloat(grade.percentage) : (grade.percentage || 0);
        return isNaN(raw) ? 0 : raw;
    };
    const isCountableGrade = (grade) => {
        // Skip grades flagged as skipped or with percentage < 1 (represents skipped/not attempted)
        return !grade.skipped && getPercentageValue(grade) >= 1;
    };
    // Helper function to get lesson range for a reporting period based on markers
    const getLessonRangeForPeriod = (subjectId, periodIndex) => {
        const markers = subjectMarkers[subjectId] || [];
        const sortedMarkers = [...markers].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        // No markers defined: treat the whole subject as one open-ended range
        if (sortedMarkers.length === 0) {
            return { min: 1, max: null };
        }
        // Period 1: From start to first marker (if exists)
        if (periodIndex === 1) {
            return {
                min: 1,
                max: sortedMarkers[0].order_index
            };
        }
        // Last period: After last marker to end
        if (periodIndex > sortedMarkers.length) {
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
    const getFilteredGradesForPeriod = (periodIndex) => {
        return grades.filter(grade => {
            if (!grade.subjectId)
                return false;
            const range = getLessonRangeForPeriod(grade.subjectId, periodIndex);
            if (!range)
                return false; // Skip if no valid range
            // Get the lesson to check its order_index
            const subjectLessons = lessons[grade.subjectId];
            if (!subjectLessons)
                return false;
            const lesson = subjectLessons.find(l => l.id === grade.lessonId);
            if (!lesson)
                return false;
            const lessonOrderIndex = lesson.order_index || lesson.orderIndex || 0;
            // Check if lesson is within range
            if (lessonOrderIndex < range.min)
                return false;
            if (range.max !== null && lessonOrderIndex > range.max)
                return false;
            return true;
        });
    };
    const currentPeriodGrades = getFilteredGradesForPeriod(currentGradingPeriod);
    const countablePeriodGrades = useMemo(() => currentPeriodGrades.filter(isCountableGrade), [currentPeriodGrades]);
    const studentsForDialog = useMemo(() => (filteredStudents.length > 0 ? filteredStudents : students), [filteredStudents, students]);
    const teacherGroupNames = useMemo(() => {
        if (studentGroups.length === 0)
            return [];
        if (teacherGroupIds.length === 0) {
            return studentGroups.map(g => g.name).filter(Boolean);
        }
        return studentGroups
            .filter(g => teacherGroupIds.includes(g.id))
            .map(g => g.name)
            .filter(Boolean);
    }, [studentGroups, teacherGroupIds]);
    const allGroupNames = useMemo(() => {
        const names = new Set();
        const sourceStudents = teacherGroupIds.length > 0 ? filteredStudents : students;
        sourceStudents.forEach(student => {
            if (!student.group_name)
                return;
            student.group_name.split(',').map(g => g.trim()).filter(Boolean).forEach(name => names.add(name));
        });
        if (names.size === 0 && teacherGroupIds.length > 0) {
            teacherGroupNames.forEach(name => names.add(name));
        }
        return Array.from(names).sort();
    }, [filteredStudents, students, teacherGroupIds, teacherGroupNames]);
    useEffect(() => {
        if (allGroupNames.length === 0)
            return;
        setSelectedGroups(prev => {
            const next = { ...prev };
            let changed = false;
            allGroupNames.forEach(name => {
                if (next[name] === undefined) {
                    next[name] = true;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [allGroupNames]);
    const filterStudentsByTeacher = useCallback((allStudents, allGroups) => {
        const selectedGroupIds = Array.isArray(window?.SELECTED_TEACHER_GROUPS)
            ? window.SELECTED_TEACHER_GROUPS
            : [];
        setTeacherGroupIds(selectedGroupIds);
        if (selectedGroupIds.length === 0 || allGroups.length === 0) {
            setFilteredStudents(allStudents);
            return;
        }
        const teacherGroupNames = allGroups
            .filter(g => selectedGroupIds.includes(g.id))
            .map(g => g.name);
        const filtered = allStudents.filter(student => {
            if (!student.group_name)
                return false;
            const studentGroupNames = student.group_name.split(',').map(g => g.trim());
            return studentGroupNames.some(name => teacherGroupNames.includes(name));
        });
        setFilteredStudents(filtered);
    }, []);
    const loadTodayAttendance = useCallback(async (dateValue) => {
        setAttendanceLoading(true);
        try {
            const res = await apiClient.getAttendance({ date: dateValue });
            const rows = Array.isArray(res.data) ? res.data : res.data?.data || [];
            const map = {};
            rows.forEach((row) => {
                const studentId = row.studentId || row.student_id;
                if (!studentId)
                    return;
                const dateOnly = typeof row.date === 'string' ? row.date.slice(0, 10) : dateValue;
                map[studentId] = {
                    id: row.id,
                    studentId,
                    date: dateOnly,
                    status: row.status,
                    notes: row.notes ?? '',
                    student_name: row.student_name,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                };
            });
            setTodayAttendanceMap(map);
        }
        catch (error) {
            console.error('Failed to load today attendance', error);
            toast.error('Could not load today\'s attendance');
        }
        finally {
            setAttendanceLoading(false);
        }
    }, []);
    const fetchAttendanceRange = useCallback(async (startDate, endDate) => {
        const res = await apiClient.getAttendance({ startDate, endDate });
        const rows = Array.isArray(res.data) ? res.data : res.data?.data || [];
        const normalized = rows.map((row) => ({
            id: row.id,
            studentId: row.studentId || row.student_id,
            date: typeof row.date === 'string' ? row.date.slice(0, 10) : row.date,
            status: row.status,
            notes: row.notes,
            student_name: row.student_name,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }));
        return normalized;
    }, []);
    const loadCurrentWeekAttendance = useCallback(async () => {
        try {
            const { startDate, endDate } = getWeekRange(0);
            const data = await fetchAttendanceRange(startDate, endDate);
            setCurrentWeekAttendance(data);
        }
        catch (error) {
            console.error('Failed to load current week attendance', error);
            toast.error('Could not load this week\'s attendance summary');
        }
    }, [fetchAttendanceRange]);
    const loadWeeklyAttendance = useCallback(async (offset) => {
        setHistoryLoading(true);
        try {
            const { startDate, endDate } = getWeekRange(offset);
            const data = await fetchAttendanceRange(startDate, endDate);
            setWeeklyAttendance(data);
        }
        catch (error) {
            console.error('Failed to load weekly attendance', error);
            toast.error('Could not load weekly attendance summary');
        }
        finally {
            setHistoryLoading(false);
        }
    }, [fetchAttendanceRange, getWeekRange]);
    useEffect(() => {
        refreshToday();
    }, [refreshToday]);
    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            const studentsRes = await apiClient.getStudents();
            const studentsData = Array.isArray(studentsRes.data) ? studentsRes.data : [];
            setStudents(studentsData);
            const groupsRes = await apiClient.getStudentGroups();
            const groupData = Array.isArray(groupsRes.data) ? groupsRes.data : [];
            setStudentGroups(groupData);
            filterStudentsByTeacher(studentsData, groupData);
            const subjectsRes = await apiClient.getSubjects();
            const subjectsList = Array.isArray(subjectsRes.data) ? subjectsRes.data : [];
            setSubjects(subjectsList);
            // Fetch teachers
            const teachersRes = await apiClient.getTeachers();
            const teachersData = Array.isArray(teachersRes.data?.data) ? teachersRes.data.data : [];
            setTeachers(teachersData);
            // Fetch all grades at once (same as GradeEntry component)
            const gradesRes = await apiClient.getGrades();
            if (gradesRes.error) {
                console.error('Failed to fetch grades:', gradesRes.error);
                setGrades([]);
            }
            else {
                setGrades(Array.isArray(gradesRes.data) ? gradesRes.data : []);
            }
            // Fetch lessons and markers for subjects that have grades
            const subjectsWithGrades = subjectsList.filter(subject => Array.isArray(gradesRes.data) && gradesRes.data.some((grade) => grade.subjectId === subject.id));
            const lessonsMap = {};
            const markersMap = {};
            await Promise.all(subjectsWithGrades.map(async (subject) => {
                const [lessonsRes, markersRes] = await Promise.all([
                    apiClient.getLessonsForSubject(subject.id),
                    apiClient.getGradingPeriodMarkersForSubject(subject.id)
                ]);
                if (Array.isArray(lessonsRes.data)) {
                    lessonsMap[subject.id] = lessonsRes.data;
                }
                if (Array.isArray(markersRes.data)) {
                    markersMap[subject.id] = markersRes.data;
                }
            }));
            setLessons(lessonsMap);
            setSubjectMarkers(markersMap);
            // Set current grading period to 1 by default
            setCurrentGradingPeriod(1);
            await Promise.all([loadWeeklyAttendance(weekOffset), loadCurrentWeekAttendance(), loadTodayAttendance(todayIso)]);
            setLoading(false);
        }
        fetchData();
        // Listen for teacher updates to refresh teacher count
        const handleTeacherUpdated = () => {
            fetchData();
        };
        window.addEventListener('gradeflow-teachers-updated', handleTeacherUpdated);
        return () => {
            window.removeEventListener('gradeflow-teachers-updated', handleTeacherUpdated);
        };
    }, [filterStudentsByTeacher, loadTodayAttendance, loadWeeklyAttendance, loadCurrentWeekAttendance, todayIso, teacherSelectionVersion]);
    useEffect(() => {
        const handleTeacherSelectionChange = () => setTeacherSelectionVersion(v => v + 1);
        window.addEventListener('teacher-selection-changed', handleTeacherSelectionChange);
        return () => {
            window.removeEventListener('teacher-selection-changed', handleTeacherSelectionChange);
        };
    }, []);
    useEffect(() => {
        if (historyDialogOpen) {
            loadWeeklyAttendance(weekOffset);
        }
    }, [historyDialogOpen, weekOffset, loadWeeklyAttendance]);
    useEffect(() => {
        if (!historyDialogOpen)
            return;
        const handleHistoryKey = (e) => {
            if (historyLoading)
                return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setWeekOffset(prev => prev - 1);
            }
            if (e.key === 'ArrowRight') {
                if (weekOffset >= 0)
                    return;
                e.preventDefault();
                setWeekOffset(prev => Math.min(prev + 1, 0));
            }
        };
        window.addEventListener('keydown', handleHistoryKey);
        return () => window.removeEventListener('keydown', handleHistoryKey);
    }, [historyDialogOpen, historyLoading, weekOffset]);
    useEffect(() => {
        if (attendanceDialogOpen) {
            refreshToday();
            setSelectedStudentIndex(0);
            setTimeout(() => {
                dialogContentRef.current?.focus();
            }, 0);
        }
    }, [attendanceDialogOpen, studentsForDialog.length, refreshToday]);
    const weekLineData = useMemo(() => {
        const visibleIds = new Set((filteredStudents.length > 0 ? filteredStudents : students).map(s => s.id));
        const base = currentWeekDates.map(date => ({
            date,
            label: parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' }),
            present: 0,
            tardy: 0,
            absent: 0,
            excused: 0,
        }));
        const byDate = new Map(base.map(entry => [entry.date, entry]));
        currentWeekAttendance.forEach(rec => {
            const studentId = rec.studentId || rec.student_id;
            if (visibleIds.size > 0 && !visibleIds.has(studentId))
                return;
            const bucket = byDate.get(rec.date);
            if (!bucket)
                return;
            const status = rec.status;
            if (status in bucket) {
                bucket[status] = bucket[status] + 1;
            }
        });
        return base;
    }, [filteredStudents, students, currentWeekDates, currentWeekAttendance]);
    const startOfWeekLabel = (isoDate) => {
        const d = new Date(`${isoDate}T00:00:00`);
        const day = d.getDay(); // 0 Sun
        const diffToMonday = (day + 6) % 7;
        d.setDate(d.getDate() - diffToMonday);
        d.setHours(0, 0, 0, 0);
        return formatLocalISO(d);
    };
    const weeklyGroupAverageData = useMemo(() => {
        if (grades.length === 0 || students.length === 0 || countablePeriodGrades.length === 0)
            return [];
        const studentMap = new Map(students.map(s => [s.id, s]));
        // Anchor to the first graded week in the selected grading period
        const earliestGradeDate = countablePeriodGrades.reduce((min, grade) => {
            const dateOnly = grade.date?.slice(0, 10);
            if (!dateOnly)
                return min;
            return min === null || dateOnly < min ? dateOnly : min;
        }, null);
        if (!earliestGradeDate)
            return [];
        const startWeekKey = startOfWeekLabel(earliestGradeDate);
        const startWeekDate = new Date(`${startWeekKey}T00:00:00`);
        // Build exactly six consecutive week buckets for the selected period
        const weekKeys = [];
        for (let i = 0; i < 6; i++) {
            const d = new Date(startWeekDate);
            d.setDate(d.getDate() + i * 7);
            weekKeys.push(formatLocalISO(d));
        }
        const buckets = new Map();
        const weeksWithData = new Set();
        countablePeriodGrades.forEach(grade => {
            const student = studentMap.get(grade.studentId);
            if (!student)
                return;
            const groups = student.group_name ? student.group_name.split(',').map(g => g.trim()).filter(Boolean) : [];
            if (groups.length === 0)
                return;
            const weekKey = startOfWeekLabel(grade.date.slice(0, 10));
            // Ignore weeks outside the six-week window
            if (!weekKeys.includes(weekKey))
                return;
            if (!buckets.has(weekKey)) {
                const sums = {};
                const counts = {};
                buckets.set(weekKey, { date: weekKey, sums, counts });
            }
            const bucket = buckets.get(weekKey);
            const pct = getPercentageValue(grade);
            groups.forEach(name => {
                bucket.sums[name] = (bucket.sums[name] || 0) + pct;
                bucket.counts[name] = (bucket.counts[name] || 0) + 1;
            });
            weeksWithData.add(weekKey);
        });
        const lastDataIndex = weekKeys.reduce((latest, key, idx) => (weeksWithData.has(key) ? idx : latest), -1);
        return weekKeys.map((weekKey, idx) => {
            const row = buckets.get(weekKey);
            const entry = {
                date: weekKey,
                label: new Date(`${weekKey}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            };
            allGroupNames.forEach(name => {
                if (idx > lastDataIndex) {
                    entry[name] = null;
                    return;
                }
                const sum = row?.sums[name] || 0;
                const count = row?.counts[name] || 0;
                entry[name] = count > 0 ? sum / count : null;
            });
            return entry;
        });
    }, [grades, students, countablePeriodGrades, allGroupNames, formatLocalISO, startOfWeekLabel]);
    const statusOrder = ['present', 'tardy', 'absent', 'excused'];
    const markAllPresent = useCallback(() => {
        setTodayAttendanceMap(prev => {
            const next = { ...prev };
            studentsForDialog.forEach(student => {
                next[student.id] = {
                    ...(next[student.id] || { studentId: student.id, date: todayIso }),
                    studentId: student.id,
                    date: todayIso,
                    status: 'present',
                };
            });
            return next;
        });
    }, [studentsForDialog, todayIso]);
    const moveToStudent = useCallback((delta) => {
        setSelectedStudentIndex(prev => {
            const maxIndex = Math.max(0, studentsForDialog.length - 1);
            const next = Math.min(Math.max(0, prev + delta), maxIndex);
            return next;
        });
    }, [studentsForDialog.length]);
    useEffect(() => {
        if (!nextBirthdayInfo)
            return;
        if (nextBirthdayInfo.daysUntil === 0) {
            toast.success(`Today is ${nextBirthdayInfo.name}'s birthday! 🎉`);
        }
    }, [nextBirthdayInfo]);
    const setStatusForStudent = useCallback((studentId, status, advance) => {
        setTodayAttendanceMap(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || { studentId, date: todayIso }),
                studentId,
                date: todayIso,
                status,
            }
        }));
        if (advance) {
            moveToStudent(1);
        }
    }, [moveToStudent, todayIso]);
    const saveTodayAttendance = useCallback(async () => {
        if (attendanceSaving)
            return;
        const payload = Object.values(todayAttendanceMap)
            .filter(r => r.status)
            .map(r => ({ studentId: r.studentId, date: todayIso, status: r.status, notes: r.notes ?? '' }));
        if (payload.length === 0) {
            toast.warning('No attendance changes to save');
            return;
        }
        setAttendanceSaving(true);
        const res = await apiClient.upsertAttendance(payload);
        setAttendanceSaving(false);
        if (res.error) {
            toast.error('Failed to save attendance');
            return;
        }
        toast.success('Attendance saved');
        loadCurrentWeekAttendance();
        if (weekOffset === 0) {
            loadWeeklyAttendance(weekOffset);
        }
        loadTodayAttendance(todayIso);
        setAttendanceDialogOpen(false);
    }, [attendanceSaving, todayAttendanceMap, todayIso, loadCurrentWeekAttendance, loadWeeklyAttendance, loadTodayAttendance, weekOffset]);
    const handleAttendanceKeyDown = useCallback((e) => {
        if (!attendanceDialogOpen || studentsForDialog.length === 0)
            return;
        const currentStudent = studentsForDialog[selectedStudentIndex];
        if (!currentStudent)
            return;
        const key = e.key;
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'p', 'a', 't', 'e', 'P', 'A', 'T', 'E'].includes(key) || (e.shiftKey && (key === 'P' || key === 'p'))) {
            e.preventDefault();
        }
        if (e.shiftKey && (key === 'P' || key === 'p')) {
            return markAllPresent();
        }
        if (key === 'ArrowDown')
            return moveToStudent(1);
        if (key === 'ArrowUp')
            return moveToStudent(-1);
        if (key === 'Enter')
            return saveTodayAttendance();
        if (key === 'ArrowRight' || key === 'ArrowLeft') {
            const currentStatus = todayAttendanceMap[currentStudent.id]?.status;
            const currentIndex = currentStatus ? statusOrder.indexOf(currentStatus) : -1;
            const direction = key === 'ArrowRight' ? 1 : -1;
            const nextIndex = currentIndex === -1
                ? (direction === 1 ? 0 : statusOrder.length - 1)
                : (currentIndex + direction + statusOrder.length) % statusOrder.length;
            setStatusForStudent(currentStudent.id, statusOrder[nextIndex], false);
            return;
        }
        const lower = key.toLowerCase();
        if (lower === 'p')
            return setStatusForStudent(currentStudent.id, 'present', true);
        if (lower === 'a')
            return setStatusForStudent(currentStudent.id, 'absent', true);
        if (lower === 't')
            return setStatusForStudent(currentStudent.id, 'tardy', true);
        if (lower === 'e')
            return setStatusForStudent(currentStudent.id, 'excused', true);
    }, [attendanceDialogOpen, studentsForDialog, selectedStudentIndex, todayAttendanceMap, statusOrder, moveToStudent, setStatusForStudent, saveTodayAttendance]);
    const handleHistoryCellClick = useCallback((studentId, date) => {
        setHistoryMenuTarget({ studentId, date });
    }, []);
    const handleHeaderStatusSelect = useCallback(async (date, status) => {
        if (historySaving || historyLoading)
            return;
        const visibleStudents = (filteredStudents.length > 0 ? filteredStudents : students);
        if (visibleStudents.length === 0)
            return;
        const visibleIds = new Set(visibleStudents.map(s => s.id));
        // Optimistic update for all visible students on that date
        setWeeklyAttendance(prev => {
            const withoutDay = prev.filter(r => !(visibleIds.has(r.studentId || r.student_id) && r.date === date));
            const replacements = visibleStudents.map(student => {
                const existing = prev.find(r => {
                    const sid = r.studentId || r.student_id;
                    return sid === student.id && r.date === date;
                });
                return {
                    ...(existing || { id: undefined, studentId: student.id, date, notes: '', created_at: undefined, updated_at: undefined, student_name: student.name }),
                    studentId: student.id,
                    date,
                    status,
                };
            });
            return [...withoutDay, ...replacements];
        });
        setHistorySaving(true);
        const payload = visibleStudents.map(student => {
            const existing = weeklyAttendance.find(r => {
                const sid = r.studentId || r.student_id;
                return sid === student.id && r.date === date;
            });
            return { studentId: student.id, date, status, notes: existing?.notes ?? '' };
        });
        const res = await apiClient.upsertAttendance(payload);
        setHistorySaving(false);
        setHeaderMenuDate(null);
        if (res.error) {
            toast.error('Could not update attendance');
            loadWeeklyAttendance(weekOffset);
            if (weekOffset === 0)
                loadCurrentWeekAttendance();
            return;
        }
        if (weekOffset === 0)
            loadCurrentWeekAttendance();
    }, [historySaving, historyLoading, filteredStudents, students, weeklyAttendance, loadWeeklyAttendance, loadCurrentWeekAttendance, weekOffset]);
    const handleHistoryStatusSelect = useCallback(async (studentId, date, status, notes) => {
        if (historySaving)
            return;
        const record = weeklyAttendance.find(r => {
            const sid = r.studentId || r.student_id;
            return sid === studentId && r.date === date;
        });
        // Optimistic update for the grid
        setWeeklyAttendance(prev => {
            const without = prev.filter(r => !((r.studentId || r.student_id) === studentId && r.date === date));
            return [...without, {
                    ...(record || { id: undefined, studentId, date, notes: '', created_at: undefined, updated_at: undefined, student_name: undefined }),
                    studentId,
                    date,
                    status,
                }];
        });
        setHistorySaving(true);
        const res = await apiClient.upsertAttendance([{ studentId, date, status, notes: notes ?? record?.notes ?? '' }]);
        setHistorySaving(false);
        setHistoryMenuTarget(null);
        if (res.error) {
            toast.error('Could not update attendance');
            loadWeeklyAttendance(weekOffset);
            if (weekOffset === 0)
                loadCurrentWeekAttendance();
            return;
        }
        if (weekOffset === 0) {
            loadCurrentWeekAttendance();
        }
    }, [historySaving, weeklyAttendance, loadWeeklyAttendance, loadCurrentWeekAttendance, weekOffset]);
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center p-8", children: _jsx("div", { className: "text-muted-foreground", children: "Loading dashboard..." }) }));
    }
    const totalStudents = students.length;
    const totalSubjects = subjects.length;
    const totalTeachers = teachers.length;
    // Calculate class average for current grading period
    const averageGrade = countablePeriodGrades.length > 0
        ? countablePeriodGrades.reduce((sum, grade) => sum + getPercentageValue(grade), 0) / countablePeriodGrades.length
        : 0;
    // Students at risk based on current grading period
    const studentsAtRisk = students.filter(student => {
        const studentGrades = countablePeriodGrades.filter(g => g.studentId === student.id);
        if (studentGrades.length === 0)
            return false;
        const studentAverage = studentGrades.reduce((sum, grade) => sum + getPercentageValue(grade), 0) / studentGrades.length;
        return studentAverage < 70;
    });
    // Students at risk based on current grading period
    const recentGrades = grades
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);
    // Helper function to get grading period name
    const getGradingPeriodName = (period) => {
        const periodNames = [
            '1st Six Weeks',
            '2nd Six Weeks',
            '3rd Six Weeks',
            '4th Six Weeks',
            '5th Six Weeks',
            '6th Six Weeks'
        ];
        return periodNames[period - 1] || `Period ${period}`;
    };
    // Navigation helper function
    const navigateToTab = (tab) => {
        window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab } }));
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-bold text-foreground", children: "Dashboard" }), _jsx("p", { className: "text-muted-foreground", children: "Overview of your classes and recent activity" })] }), _jsxs("div", { className: "grid gap-6 md:grid-cols-2 lg:grid-cols-4", children: [_jsxs(Card, { className: "cursor-pointer", onClick: () => navigateToTab('students'), children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: "Total Students" }), _jsx(Users, { className: "h-4 w-4 text-muted-foreground" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: totalStudents }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["Across ", totalTeachers, " teachers"] }), nextBirthdayInfo ? (_jsxs("div", { className: `mt-3 rounded border px-3 py-2 ${nextBirthdayInfo.daysUntil <= 7 ? 'border-amber-200 bg-amber-50' : 'border-border bg-muted/50'}`, children: [_jsx("div", { className: "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", children: "Next birthday" }), _jsxs("div", { className: "mt-1 flex items-center justify-between gap-2 text-sm", children: [_jsxs("div", { className: "flex flex-col leading-tight", children: [_jsx("span", { className: "text-xs text-foreground", children: nextBirthdayInfo.name }), _jsx("span", { className: "text-[11px] text-muted-foreground", children: nextBirthdayInfo.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })] }), _jsx(Badge, { variant: nextBirthdayInfo.daysUntil <= 7 ? 'destructive' : 'secondary', children: nextBirthdayInfo.daysUntil === 0 ? 'Today' : `${nextBirthdayInfo.daysUntil} days` })] })] })) : (_jsx("p", { className: "mt-2 text-xs text-muted-foreground", children: "Add student birthdays to track upcoming dates." }))] })] }), _jsxs(Card, { className: "cursor-pointer", onClick: () => navigateToTab('subjects'), children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: "Subjects" }), _jsx(BookOpen, { className: "h-4 w-4 text-muted-foreground" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: totalSubjects }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Active this semester" })] })] }), _jsxs(Card, { className: "cursor-pointer", onClick: () => setAverageDialogOpen(true), children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: "Class Average" }), _jsx(TrendingUp, { className: "h-4 w-4 text-muted-foreground" })] }), _jsxs(CardContent, { children: [_jsxs("div", { className: "text-2xl font-bold", children: [(typeof averageGrade === 'number' && !isNaN(averageGrade) ? averageGrade : 0).toFixed(1), "%"] }), _jsxs("div", { className: "flex items-center justify-between mt-2", children: [_jsx(Progress, { value: typeof averageGrade === 'number' && !isNaN(averageGrade) ? averageGrade : 0, className: "flex-1 mr-2" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: (e) => {
                                                            e.stopPropagation(); // Prevent card click navigation
                                                            setCurrentGradingPeriod(Math.max(1, currentGradingPeriod - 1));
                                                        }, disabled: currentGradingPeriod <= 1, className: "text-xs px-1 py-0.5 rounded bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed", children: "\u2190" }), _jsxs("span", { className: "text-xs font-medium px-1", children: [currentGradingPeriod, "/6"] }), _jsx("button", { onClick: (e) => {
                                                            e.stopPropagation(); // Prevent card click navigation
                                                            setCurrentGradingPeriod(Math.min(6, currentGradingPeriod + 1));
                                                        }, disabled: currentGradingPeriod >= 6, className: "text-xs px-1 py-0.5 rounded bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed", children: "\u2192" })] })] }), _jsxs("p", { className: "text-xs text-muted-foreground mt-1", children: [getGradingPeriodName(currentGradingPeriod), " \u2022 ", countablePeriodGrades.length, " grades"] })] })] }), _jsxs(Card, { className: "cursor-pointer", onClick: () => navigateToTab('grades'), children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: "At Risk" }), _jsx(AlertTriangle, { className: "h-4 w-4 text-muted-foreground" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold text-destructive", children: studentsAtRisk.length }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Students below 70%" })] })] })] }), _jsxs("div", { className: "grid gap-6 md:grid-cols-2", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Clock, { size: 20 }), "Recent Grades"] }) }), _jsx(CardContent, { children: recentGrades.length === 0 ? (_jsx("p", { className: "text-muted-foreground text-center py-4", children: "No grades entered yet" })) : (_jsx("div", { className: "space-y-3", children: recentGrades.map((grade, index) => {
                                        const student = students.find(s => s.id === grade.studentId);
                                        const subject = subjects.find(s => s.id === grade.subjectId);
                                        const lesson = lessons[grade.subjectId || '']?.find((l) => l.id === grade.lessonId);
                                        return (_jsxs("div", { className: "flex items-center justify-between py-2 border-b border-border last:border-0", children: [_jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "font-medium text-sm", children: student?.name }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [subject?.name, " - ", lesson?.name || `Lesson ${grade.lessonId.slice(-8)}`] })] }), _jsxs("div", { className: "text-right", children: [grade.skipped ? (_jsx(Badge, { variant: "outline", children: "SKIP" })) : (() => {
                                                            const percentage = typeof grade.percentage === 'string' ? parseFloat(grade.percentage) : (grade.percentage || 0);
                                                            return (_jsxs(Badge, { variant: percentage >= 90 ? "default" : percentage >= 70 ? "secondary" : "destructive", children: [percentage.toFixed(0), "%"] }));
                                                        })(), _jsx("p", { className: "text-xs text-muted-foreground mt-1", children: new Date(grade.date).toLocaleDateString() })] })] }, `${grade.id}-${index}`));
                                    }) })) })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex items-center justify-between", children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Clock, { size: 20 }), "Attendance"] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", onClick: () => { setHistoryDialogOpen(true); loadWeeklyAttendance(weekOffset); }, children: "View history" }), _jsx(Button, { size: "sm", onClick: () => {
                                                    const newToday = formatLocalISO(new Date());
                                                    setTodayIso(newToday);
                                                    setSelectedStudentIndex(0);
                                                    setAttendanceDialogOpen(true);
                                                    loadTodayAttendance(newToday);
                                                }, disabled: isWeekendToday, title: isWeekendToday ? 'Attendance marking is unavailable on weekends' : undefined, children: "Mark today" })] })] }), _jsxs(CardContent, { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Quickly mark presence, tardiness, or absence without leaving the dashboard." }), _jsx("div", { className: "mt-4 h-44 w-full", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: weekLineData, margin: { top: 8, right: 12, bottom: 0, left: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#e5e7eb" }), _jsx(XAxis, { dataKey: "label", tickLine: false, axisLine: false }), _jsx(YAxis, { allowDecimals: false, tickLine: false, axisLine: false, width: 28 }), _jsx(Tooltip, { formatter: (value, name) => [value, name], labelFormatter: (label) => `Day: ${label}` }), _jsx(Line, { type: "monotone", dataKey: "present", stroke: "#22c55e", strokeWidth: 2, dot: { r: 3, stroke: '#065f46', fill: '#22c55e' }, name: "Present" }), _jsx(Line, { type: "monotone", dataKey: "tardy", stroke: "#fb923c", strokeWidth: 2, dot: { r: 3, stroke: '#c2410c', fill: '#fb923c' }, name: "Tardy" }), _jsx(Line, { type: "monotone", dataKey: "absent", stroke: "#ef4444", strokeWidth: 2, dot: { r: 3, stroke: '#991b1b', fill: '#ef4444' }, name: "Absent" }), _jsx(Line, { type: "monotone", dataKey: "excused", stroke: "#0ea5e9", strokeWidth: 2, dot: { r: 3 }, name: "Excused" })] }) }) })] })] })] }), _jsx(Dialog, { open: attendanceDialogOpen, onOpenChange: (open) => {
                    if (open) {
                        const newToday = formatLocalISO(new Date());
                        setTodayIso(newToday);
                        setSelectedStudentIndex(0);
                        loadTodayAttendance(newToday);
                    }
                    setAttendanceDialogOpen(open);
                }, children: _jsxs(DialogContent, { ref: dialogContentRef, tabIndex: -1, onKeyDown: handleAttendanceKeyDown, className: "max-w-4xl", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Today's attendance" }), _jsxs(DialogDescription, { children: ["Mark status for ", todayIso, ". Use arrow (or letter) keys for quick entry."] })] }), attendanceLoading ? (_jsx("p", { className: "text-muted-foreground", children: "Loading attendance..." })) : filteredStudents.length === 0 ? (_jsx("p", { className: "text-muted-foreground", children: "No students available for the current selection." })) : (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex flex-wrap gap-3 text-xs text-muted-foreground", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-3 w-3 rounded-full bg-green-500" }), "[p]resent"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-3 w-3 rounded-full bg-orange-500" }), "[t]ardy"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-3 w-3 rounded-full bg-red-500" }), "[a]bsent"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-3 w-3 rounded-full bg-sky-500" }), "[e]xcused"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "h-3 w-3 rounded-full bg-green-500" }), "all present [Shift + p]"] })] }), _jsx("div", { className: "max-h-[60vh] overflow-y-auto space-y-2 pr-1", children: studentsForDialog.map((student, idx) => {
                                        const record = todayAttendanceMap[student.id];
                                        const isSelected = idx === selectedStudentIndex;
                                        return (_jsx("div", { className: `rounded-md border border-border p-2 ${isSelected ? 'ring-2 ring-primary/50 border-primary/60' : ''}`, children: _jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium text-sm", children: student.name }), _jsx("p", { className: "text-xs text-muted-foreground", children: student.group_name || 'No group' })] }), _jsx("div", { className: "flex items-center gap-2", children: attendanceStatusOptions.map(option => {
                                                            const checked = record?.status === option.value;
                                                            const colorClass = option.value === 'present' ? 'bg-green-500' :
                                                                option.value === 'tardy' ? 'bg-orange-500' :
                                                                    option.value === 'absent' ? 'bg-red-500' : 'bg-sky-500';
                                                            return (_jsx("button", { "aria-label": option.label, className: `h-8 w-8 rounded-full border transition ${colorClass} ${checked ? 'ring-2 ring-offset-2 ring-primary' : 'border-border hover:ring-2 hover:ring-offset-2 hover:ring-primary/50'}`, onClick: () => setStatusForStudent(student.id, option.value, false) }, option.value));
                                                        }) })] }) }, student.id));
                                    }) })] })), _jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [_jsx(Button, { variant: "outline", onClick: () => setAttendanceDialogOpen(false), children: "Close" }), _jsx(Button, { disabled: attendanceSaving || attendanceLoading || studentsForDialog.length === 0, onClick: saveTodayAttendance, children: attendanceSaving ? 'Saving...' : 'Save' })] })] }) }), _jsx(Dialog, { open: historyDialogOpen, onOpenChange: (open) => setHistoryDialogOpen(open), children: _jsxs(DialogContent, { className: "max-w-5xl max-h-[80vh] flex flex-col", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Attendance history (current week)" }), _jsx(DialogDescription, { children: "Per-day status with frozen names; colors match the legend." })] }), _jsxs("div", { className: "flex flex-col gap-3 overflow-hidden flex-1 min-h-0", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: [_jsx(Button, { variant: "outline", size: "sm", disabled: historyLoading, onClick: () => setWeekOffset(prev => prev - 1), children: "\u2190 Previous week" }), _jsx(Button, { variant: "outline", size: "sm", disabled: weekOffset >= 0 || historyLoading, onClick: () => setWeekOffset(prev => prev + 1), children: "Next week \u2192" }), _jsxs("span", { children: [new Date(`${weekRange.startDate}T00:00:00`).toLocaleDateString(), " - ", new Date(`${weekRange.endDate}T00:00:00`).toLocaleDateString()] }), historyLoading && _jsx("span", { className: "text-xs text-muted-foreground", children: "Loading..." }), _jsx("span", { className: "text-xs text-muted-foreground", children: "Use \u2190 / \u2192" })] }), _jsx("div", { className: "overflow-auto flex-1 min-h-0", children: _jsxs("table", { className: "min-w-max w-full text-sm border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "sticky left-0 bg-background border-b border-border text-left px-2 py-2", children: "Student" }), weekDates.map(date => {
                                                            const isOpen = headerMenuDate === date;
                                                            return (_jsxs("th", { className: "border-b border-border px-2 py-2 text-center text-xs text-muted-foreground cursor-pointer relative", onClick: () => setHeaderMenuDate(prev => (prev === date ? null : date)), children: [parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' }), isOpen && (_jsxs("div", { className: "absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 rounded border border-border bg-popover shadow-lg p-2 flex gap-2", children: [attendanceStatusOptions.map(option => (_jsx("button", { className: `h-7 w-7 rounded-full border ${option.value === 'present' ? 'bg-green-500' : option.value === 'tardy' ? 'bg-orange-500' : option.value === 'absent' ? 'bg-red-500' : 'bg-sky-500'} border-border hover:ring-2 hover:ring-offset-1 hover:ring-primary/50`, onClick: (e) => {
                                                                                    e.stopPropagation();
                                                                                    handleHeaderStatusSelect(date, option.value);
                                                                                }, "aria-label": `${option.label} for all`, title: `${option.label} for all`, disabled: historySaving || historyLoading }, option.value))), _jsx("button", { className: "text-xs px-2 py-1 rounded border border-border hover:bg-muted", onClick: (e) => { e.stopPropagation(); setHeaderMenuDate(null); }, disabled: historySaving || historyLoading, children: "Close" })] }))] }, date));
                                                        })] }) }), _jsx("tbody", { children: (filteredStudents.length > 0 ? filteredStudents : students).map(student => {
                                                    const statusForDay = (day) => {
                                                        const rec = weeklyAttendance.find(r => {
                                                            const sid = r.studentId || r.student_id;
                                                            return sid === student.id && r.date === day;
                                                        });
                                                        return rec?.status;
                                                    };
                                                    const dotClass = (status) => {
                                                        if (status === 'present')
                                                            return 'bg-green-500';
                                                        if (status === 'tardy')
                                                            return 'bg-orange-500';
                                                        if (status === 'absent')
                                                            return 'bg-red-500';
                                                        if (status === 'excused')
                                                            return 'bg-sky-500';
                                                        return 'bg-muted';
                                                    };
                                                    return (_jsxs("tr", { className: "border-b border-border last:border-0", children: [_jsx("td", { className: "sticky left-0 bg-background px-2 py-2 font-medium text-sm", children: _jsxs("div", { className: "flex flex-col", children: [_jsx("span", { children: student.name }), _jsx("span", { className: "text-xs text-muted-foreground", children: student.group_name || 'No group' })] }) }), weekDates.map(day => {
                                                                const status = statusForDay(day);
                                                                const isOpen = historyMenuTarget?.studentId === student.id && historyMenuTarget?.date === day;
                                                                return (_jsxs("td", { className: "px-2 py-2 text-center cursor-pointer relative", onClick: () => handleHistoryCellClick(student.id, day), children: [_jsx("span", { className: `inline-block h-3 w-3 rounded-full ${dotClass(status)}`, title: status || 'No entry' }), isOpen && (_jsxs("div", { className: "absolute z-10 top-full left-1/2 -translate-x-1/2 mt-1 rounded border border-border bg-popover shadow-lg p-2 flex gap-2", children: [attendanceStatusOptions.map(option => (_jsx("button", { className: `h-7 w-7 rounded-full border ${option.value === 'present' ? 'bg-green-500' : option.value === 'tardy' ? 'bg-orange-500' : option.value === 'absent' ? 'bg-red-500' : 'bg-sky-500'} ${status === option.value ? 'ring-2 ring-offset-1 ring-primary' : 'border-border hover:ring-2 hover:ring-offset-1 hover:ring-primary/50'}`, onClick: (e) => {
                                                                                        e.stopPropagation();
                                                                                        handleHistoryStatusSelect(student.id, day, option.value, status === option.value ? undefined : undefined);
                                                                                    }, "aria-label": option.label, title: option.label, disabled: historySaving }, option.value))), _jsx("button", { className: "text-xs px-2 py-1 rounded border border-border hover:bg-muted", onClick: (e) => { e.stopPropagation(); setHistoryMenuTarget(null); }, disabled: historySaving, children: "Close" })] }))] }, day));
                                                            })] }, student.id));
                                                }) })] }) })] })] }) }), _jsx(Dialog, { open: averageDialogOpen, onOpenChange: setAverageDialogOpen, children: _jsxs(DialogContent, { className: "max-w-4xl", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Weekly average by group" }), _jsx(DialogDescription, { children: "Select groups to show or hide. Skipped and zero-percent grades are excluded." })] }), _jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("div", { className: "flex flex-wrap gap-3", children: allGroupNames.length === 0 ? (_jsx("span", { className: "text-sm text-muted-foreground", children: "No groups available." })) : (allGroupNames.map(name => (_jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx(Checkbox, { checked: selectedGroups[name] ?? false, onCheckedChange: (checked) => setSelectedGroups(prev => ({ ...prev, [name]: Boolean(checked) })) }), _jsx("span", { children: name })] }, name)))) }), _jsx("div", { className: "h-72 w-full", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: weeklyGroupAverageData, margin: { top: 8, right: 12, bottom: 0, left: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#e5e7eb" }), _jsx(XAxis, { dataKey: "label", tickLine: false, axisLine: false }), _jsx(YAxis, { domain: [0, 100], allowDecimals: false, tickLine: false, axisLine: false, width: 32 }), _jsx(Tooltip, { formatter: (value, name) => {
                                                        if (value === null || value === undefined)
                                                            return ['—', name];
                                                        const num = typeof value === 'number' ? value : parseFloat(value);
                                                        const display = isNaN(num) ? value : num.toFixed(1);
                                                        return [display, name];
                                                    }, labelFormatter: (label) => `Week of ${label}` }), allGroupNames.map((name, idx) => {
                                                    if (!selectedGroups[name])
                                                        return null;
                                                    const colors = ['#2563eb', '#22c55e', '#f97316', '#ef4444', '#a855f7', '#0ea5e9', '#84cc16', '#d946ef'];
                                                    const color = colors[idx % colors.length];
                                                    return (_jsx(Line, { type: "monotone", dataKey: name, stroke: color, strokeWidth: 2, dot: { r: 3, stroke: '#0f172a', fill: color }, connectNulls: true, name: name }, name));
                                                })] }) }) })] })] }) })] }));
}
