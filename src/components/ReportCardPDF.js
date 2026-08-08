import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatReportPeriod } from '@/lib/reportUtils';
// Use default font supported by @react-pdf/renderer
const styles = StyleSheet.create({
    page: {
        fontSize: 11,
        paddingTop: 35,
        paddingBottom: 65,
        paddingHorizontal: 35,
        backgroundColor: '#ffffff',
    },
    header: {
        marginBottom: 20,
        textAlign: 'center',
        paddingBottom: 10,
        borderBottom: '2px solid #1e40af',
    },
    schoolName: {
        fontSize: 24,
        color: '#1e40af',
        marginBottom: 5,
    },
    reportTitle: {
        fontSize: 16,
        color: '#374151',
    },
    semester: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 5,
    },
    studentInfo: {
        flexDirection: 'row',
        marginBottom: 20,
        padding: 15,
        backgroundColor: '#f8fafc',
        borderRadius: 6,
        border: '1px solid #e2e8f0',
    },
    studentDetails: {
        flex: 1,
    },
    studentName: {
        fontSize: 18,
        color: '#1f2937',
        marginBottom: 8,
    },
    infoRow: {
        flexDirection: 'row',
        marginBottom: 3,
    },
    infoLabel: {
        width: 80,
        fontSize: 10,
        color: '#4b5563',
    },
    infoValue: {
        fontSize: 10,
        color: '#1f2937',
    },
    gpaSection: {
        width: 120,
        alignItems: 'center',
        justifyContent: 'center',
        borderLeft: '1px solid #d1d5db',
        paddingLeft: 20,
    },
    gpaLabel: {
        fontSize: 10,
        color: '#6b7280',
        marginBottom: 5,
    },
    gpa: {
        fontSize: 28,
        color: '#059669',
    },
    gradeLevel: {
        fontSize: 16,
        color: '#374151',
        marginTop: 5,
    },
    gradesSection: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        color: '#1f2937',
        marginBottom: 10,
        paddingBottom: 5,
        borderBottom: '1px solid #e5e7eb',
    },
    table: {
        border: '1px solid #d1d5db',
        borderRadius: 4,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#f3f4f6',
        padding: 8,
        borderBottom: '1px solid #d1d5db',
    },
    tableHeaderText: {
        fontSize: 10,
        color: '#374151',
    },
    subjectCol: { width: '40%' },
    percentCol: { width: '20%', textAlign: 'center' },
    gradeCol: { width: '20%', textAlign: 'center' },
    pointsCol: { width: '20%', textAlign: 'center' },
    tableRow: {
        flexDirection: 'row',
        padding: 8,
        borderBottom: '1px solid #e5e7eb',
    },
    tableCell: {
        fontSize: 10,
        color: '#374151',
    },
    tableCellCenter: {
        fontSize: 10,
        color: '#374151',
        textAlign: 'center',
    },
    gradeA: { color: '#059669' },
    gradeB: { color: '#0d9488' },
    gradeC: { color: '#ca8a04' },
    gradeD: { color: '#dc2626' },
    gradeF: { color: '#dc2626' },
    commentsSection: {
        marginTop: 20,
    },
    commentsBox: {
        border: '1px solid #d1d5db',
        borderRadius: 6,
        padding: 15,
        backgroundColor: '#fefefe',
    },
    commentsTitle: {
        fontSize: 12,
        color: '#374151',
        marginBottom: 8,
    },
    commentsText: {
        fontSize: 10,
        color: '#4b5563',
        lineHeight: 1.4,
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 35,
        right: 35,
        paddingTop: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTop: '1px solid #e5e7eb',
    },
    signature: {
        width: '45%',
    },
    signatureLine: {
        borderTop: '1px solid #9ca3af',
        width: '100%',
        marginBottom: 5,
    },
    signatureLabel: {
        fontSize: 9,
        color: '#6b7280',
    },
    dateInfo: {
        fontSize: 9,
        color: '#6b7280',
        textAlign: 'right',
    },
    gradingScale: {
        marginTop: 20,
        padding: 15,
        backgroundColor: '#f8fafc',
        borderRadius: 6,
        border: '1px solid #e2e8f0',
    },
    scaleTitle: {
        fontSize: 12,
        color: '#374151',
        marginBottom: 8,
    },
    scaleGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    scaleItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '48%',
        marginBottom: 2,
    },
    scaleGrade: {
        fontSize: 9,
        color: '#4b5563',
    },
    scaleRange: {
        fontSize: 9,
        color: '#6b7280',
    },
});
const getGPAPoints = (percentage) => {
    // Ensure percentage is a valid number
    if (typeof percentage !== 'number' || isNaN(percentage)) {
        return 0.0;
    }
    if (percentage >= 97)
        return 4.0; // A+
    if (percentage >= 93)
        return 4.0; // A
    if (percentage >= 90)
        return 3.7; // A-
    if (percentage >= 87)
        return 3.3; // B+
    if (percentage >= 83)
        return 3.0; // B
    if (percentage >= 80)
        return 2.7; // B-
    if (percentage >= 77)
        return 2.3; // C+
    if (percentage >= 73)
        return 2.0; // C
    if (percentage >= 70)
        return 1.7; // C-
    if (percentage >= 67)
        return 1.3; // D+
    if (percentage >= 65)
        return 1.0; // D
    if (percentage >= 60)
        return 0.7; // D-
    return 0.0; // F
};
const getLetterGrade = (percentage) => {
    // Ensure percentage is a valid number
    if (typeof percentage !== 'number' || isNaN(percentage)) {
        return 'N/A';
    }
    if (percentage >= 93)
        return 'A';
    if (percentage >= 90)
        return 'A-';
    if (percentage >= 87)
        return 'B+';
    if (percentage >= 83)
        return 'B';
    if (percentage >= 80)
        return 'B-';
    if (percentage >= 77)
        return 'C+';
    if (percentage >= 73)
        return 'C';
    if (percentage >= 70)
        return 'C-';
    if (percentage >= 67)
        return 'D+';
    if (percentage >= 65)
        return 'D';
    if (percentage >= 60)
        return 'D-';
    return 'F';
};
const getGradeStyle = (grade) => {
    switch (grade) {
        case 'A':
        case 'A-':
            return styles.gradeA;
        case 'B+':
        case 'B':
        case 'B-':
            return styles.gradeB;
        case 'C+':
        case 'C':
        case 'C-':
            return styles.gradeC;
        case 'D+':
        case 'D':
        case 'D-':
            return styles.gradeD;
        case 'F':
            return styles.gradeF;
        default:
            return {};
    }
};
const ReportCardPDF = ({ student, reportCard, schoolName = "Lincoln Elementary School", firstDayOfSchool, showPercentage = true }) => {
    // Add safety checks for required props
    if (!student || !reportCard) {
        return (_jsx(Document, { children: _jsx(Page, { size: "A4", style: styles.page, children: _jsxs(View, { style: styles.header, children: [_jsx(Text, { style: styles.schoolName, children: "Error" }), _jsx(Text, { style: styles.reportTitle, children: "Unable to generate report" }), _jsx(Text, { style: styles.semester, children: "Missing required data" })] }) }) }));
    }
    const inferredStartYear = (() => {
        if (!firstDayOfSchool)
            return new Date().getFullYear();
        const yearPart = firstDayOfSchool.split('-')[0];
        const parsedYear = parseInt(yearPart, 10);
        if (!isNaN(parsedYear))
            return parsedYear;
        const parsedDate = new Date(firstDayOfSchool);
        return isNaN(parsedDate.getTime()) ? new Date().getFullYear() : parsedDate.getFullYear();
    })();
    const reportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    return (_jsx(Document, { children: _jsxs(Page, { size: "A4", style: styles.page, children: [_jsxs(View, { style: styles.header, children: [_jsx(Text, { style: styles.schoolName, children: schoolName }), _jsx(Text, { style: styles.reportTitle, children: "Academic Report Card" }), _jsxs(Text, { style: styles.semester, children: [formatReportPeriod(reportCard.period), " \u2022 ", inferredStartYear, "-", inferredStartYear + 1, " School Year"] })] }), _jsxs(View, { style: styles.studentInfo, children: [_jsxs(View, { style: styles.studentDetails, children: [_jsx(Text, { style: styles.studentName, children: student.name || 'Unknown Student' }), _jsxs(View, { style: styles.infoRow, children: [_jsx(Text, { style: styles.infoLabel, children: "Subjects:" }), _jsx(Text, { style: styles.infoValue, children: reportCard.subjects.length })] }), _jsxs(View, { style: styles.infoRow, children: [_jsx(Text, { style: styles.infoLabel, children: "Class:" }), _jsx(Text, { style: styles.infoValue, children: student.group_name || student.grade || 'N/A' })] })] }), _jsxs(View, { style: styles.gpaSection, children: [_jsx(Text, { style: styles.gpaLabel, children: showPercentage ? 'Overall Percentage' : 'Overall GPA' }), _jsx(Text, { style: styles.gpa, children: (() => {
                                        const gpa = typeof reportCard.overallGPA === 'number' && !isNaN(reportCard.overallGPA) && isFinite(reportCard.overallGPA)
                                            ? reportCard.overallGPA
                                            : 0;
                                        if (showPercentage) {
                                            return `${gpa.toFixed(1)}%`;
                                        }
                                        else {
                                            const gpaPoints = getGPAPoints(gpa);
                                            return typeof gpaPoints === 'number' ? gpaPoints.toFixed(2) : '0.00';
                                        }
                                    })() }), _jsx(Text, { style: styles.gradeLevel, children: getLetterGrade(typeof reportCard.overallGPA === 'number' ? reportCard.overallGPA : 0) })] })] }), _jsxs(View, { style: styles.gradesSection, children: [_jsx(Text, { style: styles.sectionTitle, children: "Academic Performance" }), _jsxs(View, { style: styles.table, children: [_jsxs(View, { style: styles.tableHeader, children: [_jsx(Text, { style: [styles.tableHeaderText, styles.subjectCol], children: "Subject" }), _jsx(Text, { style: [styles.tableHeaderText, styles.percentCol], children: "Percentage" }), _jsx(Text, { style: [styles.tableHeaderText, styles.gradeCol], children: "Grade" }), _jsx(Text, { style: [styles.tableHeaderText, styles.pointsCol], children: showPercentage ? 'Percentage' : 'Points' })] }), reportCard.subjects && Array.isArray(reportCard.subjects) && reportCard.subjects.length > 0 ? reportCard.subjects.map((subject, index) => {
                                    // Add comprehensive safety checks for undefined values
                                    if (!subject) {
                                        return (_jsxs(View, { style: styles.tableRow, children: [_jsx(Text, { style: [styles.tableCell, styles.subjectCol], children: "Invalid Subject" }), _jsx(Text, { style: [styles.tableCellCenter, styles.percentCol], children: "0.0%" }), _jsx(Text, { style: [styles.tableCellCenter, styles.gradeCol], children: "N/A" }), _jsx(Text, { style: [styles.tableCellCenter, styles.pointsCol], children: showPercentage ? '0.0%' : '0.0' })] }, `empty-subject-${index}`));
                                    }
                                    const rawAverage = subject.average;
                                    const average = typeof rawAverage === 'number' && !isNaN(rawAverage) && isFinite(rawAverage) ? rawAverage : 0;
                                    const letterGrade = getLetterGrade(average);
                                    const gpaPoints = getGPAPoints(average);
                                    const safeGpaPoints = typeof gpaPoints === 'number' && !isNaN(gpaPoints) && isFinite(gpaPoints) ? gpaPoints : 0;
                                    return (_jsxs(View, { style: styles.tableRow, children: [_jsx(Text, { style: [styles.tableCell, styles.subjectCol], children: subject.subjectName || 'Unknown Subject' }), _jsxs(Text, { style: [styles.tableCellCenter, styles.percentCol], children: [average.toFixed(1), "%"] }), _jsx(Text, { style: [
                                                    styles.tableCellCenter,
                                                    styles.gradeCol,
                                                    getGradeStyle(letterGrade)
                                                ], children: letterGrade }), _jsx(Text, { style: [styles.tableCellCenter, styles.pointsCol], children: showPercentage ? `${average.toFixed(1)}%` : safeGpaPoints.toFixed(1) })] }, subject.subjectId || `subject-${index}`));
                                }) : (_jsxs(View, { style: styles.tableRow, children: [_jsx(Text, { style: [styles.tableCell, styles.subjectCol], children: "No subjects available" }), _jsx(Text, { style: [styles.tableCellCenter, styles.percentCol], children: "--" }), _jsx(Text, { style: [styles.tableCellCenter, styles.gradeCol], children: "--" }), _jsx(Text, { style: [styles.tableCellCenter, styles.pointsCol], children: "--" })] }))] })] }), reportCard.comments && (_jsxs(View, { style: styles.commentsSection, children: [_jsx(Text, { style: styles.sectionTitle, children: "Teacher Comments" }), _jsx(View, { style: styles.commentsBox, children: _jsx(Text, { style: styles.commentsText, children: reportCard.comments }) })] })), _jsxs(View, { style: styles.gradingScale, children: [_jsx(Text, { style: styles.scaleTitle, children: "Grading Scale" }), _jsxs(View, { style: styles.scaleGrid, children: [_jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "A" }), _jsx(Text, { style: styles.scaleRange, children: "93-100%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "A-" }), _jsx(Text, { style: styles.scaleRange, children: "90-92%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "B+" }), _jsx(Text, { style: styles.scaleRange, children: "87-89%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "B" }), _jsx(Text, { style: styles.scaleRange, children: "83-86%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "B-" }), _jsx(Text, { style: styles.scaleRange, children: "80-82%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "C+" }), _jsx(Text, { style: styles.scaleRange, children: "77-79%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "C" }), _jsx(Text, { style: styles.scaleRange, children: "73-76%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "C-" }), _jsx(Text, { style: styles.scaleRange, children: "70-72%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "D+" }), _jsx(Text, { style: styles.scaleRange, children: "67-69%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "D" }), _jsx(Text, { style: styles.scaleRange, children: "65-66%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "D-" }), _jsx(Text, { style: styles.scaleRange, children: "60-64%" })] }), _jsxs(View, { style: styles.scaleItem, children: [_jsx(Text, { style: styles.scaleGrade, children: "F" }), _jsx(Text, { style: styles.scaleRange, children: "Below 60%" })] })] })] }), _jsxs(View, { style: styles.footer, children: [_jsxs(View, { style: styles.signature, children: [_jsx(View, { style: styles.signatureLine }), _jsx(Text, { style: styles.signatureLabel, children: "Teacher Signature" })] }), _jsxs(View, { style: styles.signature, children: [_jsx(View, { style: styles.signatureLine }), _jsx(Text, { style: styles.signatureLabel, children: "Parent/Guardian Signature" })] }), _jsx(View, { style: styles.dateInfo, children: _jsxs(Text, { style: styles.signatureLabel, children: ["Date: ", reportDate] }) })] })] }) }));
};
export default ReportCardPDF;
