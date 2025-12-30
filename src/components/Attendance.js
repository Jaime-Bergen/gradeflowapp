import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, Clock3, MinusCircle, XCircle } from 'lucide-react';
const statusOptions = [
    { value: 'present', label: 'Present', icon: _jsx(CheckCircle2, { className: "h-4 w-4" }) },
    { value: 'tardy', label: 'Tardy', icon: _jsx(Clock3, { className: "h-4 w-4" }) },
    { value: 'absent', label: 'Absent', icon: _jsx(XCircle, { className: "h-4 w-4" }) },
    { value: 'excused', label: 'Excused', icon: _jsx(MinusCircle, { className: "h-4 w-4" }) }
];
const statusVariants = {
    present: 'default',
    tardy: 'secondary',
    absent: 'destructive',
    excused: 'outline'
};
export default function Attendance() {
    const today = useMemo(() => new Date().toISOString().split('T')[0], []);
    const [selectedDate, setSelectedDate] = useState(today);
    const [students, setStudents] = useState([]);
    const [studentGroups, setStudentGroups] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [attendanceMap, setAttendanceMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const filterStudentsByTeacherGroups = useCallback(() => {
        const selectedGroupIds = window.SELECTED_TEACHER_GROUPS;
        if (studentGroups.length === 0) {
            setFilteredStudents(students);
            return;
        }
        if (!selectedGroupIds || selectedGroupIds.length === 0) {
            setFilteredStudents(students);
            return;
        }
        const teacherGroupNames = studentGroups
            .filter(group => selectedGroupIds.includes(group.id))
            .map(group => group.name);
        const filtered = students.filter(student => {
            if (!student.group_name)
                return false;
            const studentGroupNames = student.group_name.split(',').map(g => g.trim());
            return studentGroupNames.some(g => teacherGroupNames.includes(g));
        });
        setFilteredStudents(filtered);
    }, [students, studentGroups]);
    const fetchStudents = useCallback(async () => {
        try {
            const studentsRes = await apiClient.getStudents();
            const studentsData = Array.isArray(studentsRes.data)
                ? studentsRes.data
                : studentsRes.data?.students || [];
            setStudents(studentsData);
            const groupsRes = await apiClient.getStudentGroups();
            const groupData = Array.isArray(groupsRes.data) ? groupsRes.data : groupsRes.data?.groups || [];
            setStudentGroups(groupData);
        }
        catch (error) {
            console.error('Failed to fetch students for attendance', error);
            toast.error('Could not load students');
        }
    }, []);
    const fetchAttendance = useCallback(async (dateValue) => {
        setLoading(true);
        try {
            const res = await apiClient.getAttendance({ date: dateValue });
            const rawData = Array.isArray(res.data) ? res.data : res.data?.data || [];
            const mapped = {};
            rawData.forEach((record) => {
                const normalized = {
                    id: record.id,
                    studentId: record.studentId || record.student_id,
                    date: record.date,
                    status: record.status,
                    notes: record.notes ?? '',
                    student_name: record.student_name,
                    created_at: record.created_at,
                    updated_at: record.updated_at
                };
                if (normalized.studentId) {
                    mapped[normalized.studentId] = normalized;
                }
            });
            setAttendanceMap(mapped);
        }
        catch (error) {
            console.error('Failed to fetch attendance', error);
            toast.error('Could not load attendance for the selected date');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchStudents();
    }, [fetchStudents]);
    useEffect(() => {
        filterStudentsByTeacherGroups();
    }, [students, studentGroups, filterStudentsByTeacherGroups]);
    useEffect(() => {
        fetchAttendance(selectedDate);
    }, [selectedDate, fetchAttendance]);
    const statusCounts = useMemo(() => {
        const counts = {
            present: 0,
            tardy: 0,
            absent: 0,
            excused: 0
        };
        filteredStudents.forEach(student => {
            const status = attendanceMap[student.id]?.status;
            if (status && counts[status] !== undefined) {
                counts[status] += 1;
            }
        });
        return counts;
    }, [attendanceMap, filteredStudents]);
    const updateStatus = (studentId, status) => {
        setAttendanceMap(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || { studentId, date: selectedDate }),
                studentId,
                date: selectedDate,
                status
            }
        }));
    };
    const updateNote = (studentId, note) => {
        setAttendanceMap(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || { studentId, date: selectedDate }),
                studentId,
                date: selectedDate,
                notes: note
            }
        }));
    };
    const markAllPresent = () => {
        const updated = { ...attendanceMap };
        filteredStudents.forEach(student => {
            updated[student.id] = {
                ...(updated[student.id] || { studentId: student.id, date: selectedDate }),
                studentId: student.id,
                date: selectedDate,
                status: 'present'
            };
        });
        setAttendanceMap(updated);
    };
    const handleSave = async () => {
        const payload = Object.values(attendanceMap)
            .filter(record => record.status)
            .map(record => ({
            studentId: record.studentId,
            date: selectedDate,
            status: record.status,
            notes: record.notes ?? ''
        }));
        if (payload.length === 0) {
            toast.warning('No attendance changes to save');
            return;
        }
        setSaving(true);
        const res = await apiClient.upsertAttendance(payload);
        setSaving(false);
        if (res.error) {
            toast.error('Failed to save attendance');
            return;
        }
        toast.success(`Saved attendance for ${payload.length} students`);
        fetchAttendance(selectedDate);
    };
    const hasData = filteredStudents.length > 0;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-col gap-3 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-foreground", children: "Attendance" }), _jsx("p", { className: "text-muted-foreground", children: "Mark daily presence, tardiness, and absence" })] }), _jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm text-muted-foreground", children: "Date" }), _jsx(Input, { type: "date", value: selectedDate, onChange: (e) => setSelectedDate(e.target.value), className: "w-48" })] }), _jsx(Button, { variant: "secondary", onClick: markAllPresent, disabled: !hasData || loading, children: "Mark all present" }), _jsx(Button, { onClick: handleSave, disabled: saving || loading || !hasData, children: saving ? 'Saving...' : 'Save attendance' })] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between", children: [_jsx(CardTitle, { className: "text-lg", children: "Daily summary" }), _jsxs("div", { className: "flex gap-2 text-sm", children: [_jsxs(Badge, { variant: "default", children: ["Present: ", statusCounts.present] }), _jsxs(Badge, { variant: "secondary", children: ["Tardy: ", statusCounts.tardy] }), _jsxs(Badge, { variant: "destructive", children: ["Absent: ", statusCounts.absent] }), _jsxs(Badge, { variant: "outline", children: ["Excused: ", statusCounts.excused] })] })] }), _jsx(CardContent, { children: loading ? (_jsx("p", { className: "text-muted-foreground", children: "Loading attendance..." })) : !hasData ? (_jsx("p", { className: "text-muted-foreground", children: "No students available for the selected teacher or group." })) : (_jsx("div", { className: "space-y-3", children: filteredStudents.map(student => {
                                const record = attendanceMap[student.id];
                                return (_jsxs("div", { className: "rounded-lg border border-border p-3", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium text-sm", children: student.name }), _jsx("p", { className: "text-xs text-muted-foreground", children: student.group_name || 'No group' })] }), _jsx("div", { className: "flex flex-wrap gap-2", children: statusOptions.map(option => (_jsxs(Button, { variant: record?.status === option.value ? statusVariants[option.value] : 'outline', size: "sm", onClick: () => updateStatus(student.id, option.value), children: [_jsx("span", { className: "mr-2", children: option.icon }), option.label] }, option.value))) })] }), _jsx("div", { className: "mt-3", children: _jsx(Input, { placeholder: "Add note (optional)", value: record?.notes ?? '', onChange: (e) => updateNote(student.id, e.target.value) }) })] }, student.id));
                            }) })) })] })] }));
}
