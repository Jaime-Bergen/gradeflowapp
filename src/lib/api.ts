import { useState, useEffect } from 'react';
import { AttendanceRecord, Grade, RolloverScope, RolloverScopePreview, SchoolYear, User, UserSchoolYearLicense } from '@/lib/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

class ApiClient {
  private responseCache = new Map<string, { expiresAt: number; value: ApiResponse<any> }>()
  private inFlightRequests = new Map<string, Promise<ApiResponse<any>>>()

  async createLesson(subjectId: string, name: string, categoryId: string, maxPoints: number, orderIndex: number) {
    return this.request(`/lessons/subject/${subjectId}`, {
      method: 'POST',
      body: JSON.stringify({ name, categoryId, maxPoints, orderIndex }),
    });
  }
  
  async deleteLesson(lessonId: string) {
    return this.request(`/lessons/${lessonId}`, {
      method: 'DELETE',
    });
  }
  
  async updateLesson(
    lessonId: string,
    data: Partial<{ name: string; categoryId: string; points: number; orderIndex: number; date: string | null }>
  ) {
    return this.request(`/lessons/${lessonId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Get all users with grade data usage (admin only)
  async getAllUsers() {
    return this.request<Array<{
      id: string;
      name: string;
      email: string;
      created_at: string;
      last_login_at?: string;
      grades_record_count: number;
      grades_estimated_bytes: number;
    }>>('/users');
  }
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('auth_token');
  }

  private clearCache(prefix?: string) {
    if (!prefix) {
      this.responseCache.clear()
      this.inFlightRequests.clear()
      return
    }

    for (const key of this.responseCache.keys()) {
      if (key.startsWith(prefix)) {
        this.responseCache.delete(key)
      }
    }

    for (const key of this.inFlightRequests.keys()) {
      if (key.startsWith(prefix)) {
        this.inFlightRequests.delete(key)
      }
    }
  }

  private getAuthToken(): string | null {
    return this.token || localStorage.getItem('auth_token');
  }

  private withSchoolYear(endpoint: string, schoolYearId?: string) {
    if (!schoolYearId) return endpoint
    const separator = endpoint.includes('?') ? '&' : '?'
    return `${endpoint}${separator}schoolYearId=${encodeURIComponent(schoolYearId)}`
  }

  private async cachedRequest<T = any>(endpoint: string, ttlMs = 30000): Promise<ApiResponse<T>> {
    const cacheKey = endpoint
    const now = Date.now()
    const cached = this.responseCache.get(cacheKey)

    if (cached && cached.expiresAt > now) {
      return cached.value as ApiResponse<T>
    }

    const inFlight = this.inFlightRequests.get(cacheKey)
    if (inFlight) {
      return inFlight as Promise<ApiResponse<T>>
    }

    const requestPromise = this.request<T>(endpoint).then((response) => {
      this.inFlightRequests.delete(cacheKey)
      if (!response.error) {
        this.responseCache.set(cacheKey, {
          expiresAt: now + ttlMs,
          value: response,
        })
      }
      return response
    })

    this.inFlightRequests.set(cacheKey, requestPromise as Promise<ApiResponse<any>>)
    return requestPromise
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
    this.clearCache()
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
    this.clearCache()
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const token = this.getAuthToken();
    const url = `${this.baseURL}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          // Clear invalid token
          this.clearToken();
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Handle 204 No Content responses
      if (response.status === 204) {
        return { data: undefined };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      console.error('API request failed:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Auth methods
  async login(email: string, password: string) {
    const response = await this.request<{token: string; user: User}>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (response.data) {
      this.setToken(response.data.token);
    }
    
    return response;
  }

  async register(email: string, password: string, name: string) {
    const response = await this.request<{token: string; user: User}>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    
    if (response.data) {
      this.setToken(response.data.token);
    }
    
    return response;
  }

  async resetPassword(email: string) {
    return this.request<{message: string}>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async sendVerificationEmail() {
    return this.request<{message: string}>('/auth/send-verification-email', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  async verifyEmail(token: string) {
    return this.request<{message: string}>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  }

  async getProfile() {
    return this.request<User>('/users/profile');
  }

  async updateProfile(data: { 
    name?: string; 
    school_name?: string; 
    first_day_of_school?: string; 
    grading_periods?: number;
    grading_mode?: 'dates' | 'markers';
    auto_enroll_subjects?: boolean;
    active_school_year_id?: string | null
  }) {
    return this.request<User>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getLicensedSchoolYears() {
    return this.request('/users/licensed-years')
  }

  async getAvailableSchoolYears() {
    return this.request<SchoolYear[]>('/users/school-years')
  }

  async setActiveSchoolYear(schoolYearId: string) {
    return this.request('/users/active-school-year', {
      method: 'PUT',
      body: JSON.stringify({ schoolYearId })
    })
  }

  async getAdminSchoolYears(adminPasscode: string) {
    return this.request<SchoolYear[]>('/users/admin/school-years', {
      headers: {
        'x-admin-passcode': adminPasscode,
      },
    })
  }

  async createAdminSchoolYear(
    adminPasscode: string,
    payload: { label: string; startDate: string; endDate: string }
  ) {
    return this.request<SchoolYear>('/users/admin/school-years', {
      method: 'POST',
      headers: {
        'x-admin-passcode': adminPasscode,
      },
      body: JSON.stringify(payload),
    })
  }

  async getAdminUserLicenses(adminPasscode: string, userId: string) {
    return this.request<UserSchoolYearLicense[]>(`/users/admin/licenses/${userId}`, {
      headers: {
        'x-admin-passcode': adminPasscode,
      },
    })
  }

  async grantAdminUserLicense(
    adminPasscode: string,
    payload: { userId: string; schoolYearId: string; licenseTier?: 'full' | 'single' | 'trial'; notes?: string; setAsActive?: boolean }
  ) {
    return this.request('/users/admin/licenses/grant', {
      method: 'POST',
      headers: {
        'x-admin-passcode': adminPasscode,
      },
      body: JSON.stringify(payload),
    })
  }

  async revokeAdminUserLicense(adminPasscode: string, licenseId: string) {
    return this.request<{ success: boolean }>(`/users/admin/licenses/${licenseId}`, {
      method: 'DELETE',
      headers: {
        'x-admin-passcode': adminPasscode,
      },
    })
  }

  async createBillingCheckoutSession(payload: { plan: 'full' | 'single'; schoolYearId: string }) {
    return this.request<{ url: string }>('/billing/checkout-session', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async claimFreeYearLicense(payload: { schoolYearId: string; schoolName: string; country: string }) {
    return this.request<{ message: string; activeSchoolYearLabel?: string }>('/billing/claim-free-year', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async grantTrialLicense(payload: { schoolYearId: string }) {
    return this.request<{ message: string; school_year_id?: string; license_tier?: 'full' | 'single' | 'trial' }>('/users/licenses/trial', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async getBillingCheckoutSessionStatus(sessionId: string) {
    return this.request<{
      sessionId: string
      status: string | null
      paymentStatus: string | null
      mode: string | null
      schoolYearId: string
      hasLicense: boolean
      paid: boolean
    }>(`/billing/checkout-session-status?sessionId=${encodeURIComponent(sessionId)}`)
  }

  async getRolloverScopes(schoolYearId?: string) {
    return this.request<RolloverScope[]>(this.withSchoolYear('/rollover/scopes', schoolYearId))
  }

  async createRolloverScope(
    payload: { name: string; minGrade: number; maxGrade: number; teacherId?: string | null },
    schoolYearId?: string
  ) {
    return this.request<RolloverScope>(this.withSchoolYear('/rollover/scopes', schoolYearId), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateRolloverScope(
    scopeId: string,
    payload: { name: string; minGrade: number; maxGrade: number; teacherId?: string | null }
  ) {
    return this.request<RolloverScope>(`/rollover/scopes/${scopeId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async lockRolloverScope(scopeId: string, payload?: { teacherId?: string | null; notes?: string }, schoolYearId?: string) {
    return this.request<RolloverScope>(this.withSchoolYear(`/rollover/scopes/${scopeId}/lock`, schoolYearId), {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    })
  }

  async unlockRolloverScope(scopeId: string) {
    return this.request<RolloverScope>(`/rollover/scopes/${scopeId}/unlock`, {
      method: 'POST',
    })
  }

  async getRolloverScopePreview(scopeId: string, riskThreshold = 80) {
    return this.request<RolloverScopePreview>(`/rollover/scopes/${scopeId}/preview?riskThreshold=${riskThreshold}`)
  }

  async executeRolloverStudents(
    scopeId: string,
    payload: { targetSchoolYearId: string; holdBackStudentIds?: string[] },
    schoolYearId?: string
  ) {
    return this.request(this.withSchoolYear(`/rollover/scopes/${scopeId}/execute/students`, schoolYearId), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async executeRolloverSubjects(
    scopeId: string,
    payload: { targetSchoolYearId: string; subjectIds?: string[] },
    schoolYearId?: string
  ) {
    return this.request(this.withSchoolYear(`/rollover/scopes/${scopeId}/execute/subjects`, schoolYearId), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async finalizeRollover(payload: { targetSchoolYearId: string; firstDayOfSchool?: string }, schoolYearId?: string) {
    return this.request(this.withSchoolYear('/rollover/finalize', schoolYearId), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    return this.request<{ message: string }>('/users/change-password', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  logout() {
    this.clearToken();
  }

  // Submit feedback (bug reports and feature requests)
  async submitFeedback(feedbackData: {
    to: string;
    subject: string;
    type: 'bug' | 'feature';
    data: any;
  }) {
    return this.request<{ message: string }>('/feedback', {
      method: 'POST',
      body: JSON.stringify(feedbackData),
    });
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  // Students
  async getStudents(groupId?: string, schoolYearId?: string) {
    const params = groupId ? `?groupId=${groupId}` : '';
    const endpoint = this.withSchoolYear(`/students${params}`, schoolYearId)
    return this.request(endpoint);
  }

  async createStudent(data: any) {
    return this.request('/students', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStudent(id: string, data: any) {
    return this.request(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStudent(id: string) {
    return this.request(`/students/${id}`, {
      method: 'DELETE',
    });
  }

  async bulkImportStudents(data: { students: Array<{ name: string; birthday?: string; group?: string }> }) {
    return this.request('/students/bulk-import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async bulkImportSubjects(data: { subjects: Array<{ name: string; group?: string; reportCardName?: string }> }) {
    const response = await this.request('/subjects/bulk-import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.clearCache('/subjects')
    return response
  }

  // Update subjects for a student
  async updateStudentSubjects(studentId: string, data: { subjects: string[] }) {
    return this.request(`/students/${studentId}/subjects`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Student Groups
  async getStudentGroups(schoolYearId?: string) {
    return this.request(this.withSchoolYear('/students/groups', schoolYearId));
  }

  async createStudentGroup(data: any) {
    return this.request('/students/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStudentGroup(id: string, data: any) {
    return this.request(`/students/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStudentGroup(id: string) {
    return this.request(`/students/groups/${id}`, {
      method: 'DELETE',
    });
  }

  // Grade Category Types
  async getGradeCategoryTypes() {
    try {
      const result = await this.request('/grade-category-types');
      return result
    } catch (error) {
      console.error('API: Error in getGradeCategoryTypes:', error)
      throw error
    }
  }

  async getActiveGradeCategoryTypes() {
    return this.request('/grade-category-types/active');
  }

  async createGradeCategoryType(data: { name: string; description?: string; is_active?: boolean; is_default?: boolean; color?: string }) {
    return this.request('/grade-category-types', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateGradeCategoryType(id: string, data: { name: string; description?: string; is_active?: boolean; is_default?: boolean; color?: string }) {
    return this.request(`/grade-category-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteGradeCategoryType(id: string) {
    return this.request(`/grade-category-types/${id}`, {
      method: 'DELETE',
    });
  }

  async checkGradeCategoryTypeUsage(id: string) {
    return this.request(`/grade-category-types/${id}/usage`);
  }

  // Subjects
  async getSubjects(groupId?: string, schoolYearId?: string) {
    const params = groupId ? `?groupId=${groupId}` : '';
    const endpoint = this.withSchoolYear(`/subjects${params}`, schoolYearId)
    return this.cachedRequest(endpoint);
  }

  async createSubject(data: any) {
    const response = await this.request('/subjects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.clearCache('/subjects')
    return response
  }

  async updateSubject(id: string, data: any) {
    const response = await this.request(`/subjects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    this.clearCache('/subjects')
    return response
  }

  async deleteSubject(id: string) {
    const response = await this.request(`/subjects/${id}`, {
      method: 'DELETE',
    });
    this.clearCache('/subjects')
    return response
  }

  async getSubjectWithLessons(id: string) {
    return this.request(`/subjects/${id}`);
  }

  async addLessonsToSubject(
    subjectId: string,
    count: number,
    namePrefix?: string,
    type?: string,
    points?: number,
    categoryId?: string
  ) {
    return this.request(`/lessons/bulk`, {
      method: 'POST',
      body: JSON.stringify({ subjectId, count, namePrefix, type, points, categoryId }),
    });
  }

  async getLessonsForSubject(subjectId: string) {
    return this.request(`/lessons/subject/${subjectId}`);
  }

  // Grading Periods (date-based reporting)
  async getGradingPeriods() {
    return this.request(`/grading-periods`)
  }

  async upsertGradingPeriods(periods: Array<{ id?: string; name: string; startDate: string; endDate: string; orderIndex: number }>) {
    return this.request(`/grading-periods`, {
      method: 'PUT',
      body: JSON.stringify({ periods })
    })
  }

  // Grading Period Markers
  async getGradingPeriodMarkersForSubject(subjectId: string) {
    return this.request(`/grading-period-markers/subject/${subjectId}`);
  }

  async createGradingPeriodMarker(subjectId: string, name: string | undefined, orderIndex: number) {
    const body: any = { subjectId, orderIndex };
    if (name) body.name = name;
    return this.request('/grading-period-markers', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateGradingPeriodMarker(markerId: string, name: string, orderIndex: number) {
    return this.request(`/grading-period-markers/${markerId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, orderIndex }),
    });
  }

  async deleteGradingPeriodMarker(markerId: string) {
    return this.request(`/grading-period-markers/${markerId}`, {
      method: 'DELETE',
    });
  }

  // Grades
  async getGradesForSubject(subjectId: string) {
    return this.request(`/grades/subject/${subjectId}`);
  }

  async setGrade(studentId: string, lessonId: string, gradeData: any) {
    const result = await this.request(`/grades/student/${studentId}/lesson/${lessonId}`, {
      method: 'PUT',
      body: JSON.stringify(gradeData),
    });
    return result;
  }

  async updateLessonPoints(subjectId: string, lessonId: string, points: number) {
    return this.request(`/grades/subject/${subjectId}/lessons/points`, {
      method: 'PATCH',
      body: JSON.stringify({ lessonId, points }),
    });
  }

  // Reports
  async getDashboardStats() {
    return this.request('/reports/dashboard');
  }

  async getStudentReport(studentId: string) {
    return this.request(`/reports/student/${studentId}`);
  }

  async getGroupReport(groupId: string) {
    return this.request(`/reports/group/${groupId}`);
  }

  // Add updateGrade method to apiClient
  async updateGrade(grade: Grade) {
    return this.request(`/grades/${grade.id}`, {
      method: 'PUT',
      body: JSON.stringify(grade),
    })
  }

  // Add deleteGrade method to apiClient
  async deleteGrade(studentId: string, lessonId: string) {
    return this.request(`/grades/student/${studentId}/lesson/${lessonId}`, {
      method: 'DELETE',
    })
  }

  // Add getGrades method to apiClient
  async getGrades() {
    return this.request('/grades', { method: 'GET' });
  }

  // Attendance
  async getAttendance(params?: { date?: string; startDate?: string; endDate?: string }) {
    const search = new URLSearchParams()
    if (params?.date) search.set('date', params.date)
    if (params?.startDate) search.set('startDate', params.startDate)
    if (params?.endDate) search.set('endDate', params.endDate)
    const qs = search.toString()
    return this.request<AttendanceRecord[]>(`/attendance${qs ? `?${qs}` : ''}`)
  }

  async upsertAttendance(records: Array<Pick<AttendanceRecord, 'studentId' | 'date' | 'status' | 'notes'>>) {
    return this.request<{ success: boolean; count: number }>(`/attendance/bulk`, {
      method: 'POST',
      body: JSON.stringify({ records })
    })
  }

  async getStudentAttendance(studentId: string, limit = 50) {
    return this.request<AttendanceRecord[]>(`/attendance/student/${studentId}?limit=${limit}`)
  }

  // Teachers
  async getTeachers() {
    return this.cachedRequest('/teachers');
  }

  async getTeacher(id: string) {
    return this.request(`/teachers/${id}`);
  }

  async createTeacher(data: { name: string; email: string; password: string; selectedGroups?: string[] }) {
    const response = await this.request('/teachers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.clearCache('/teachers')
    return response
  }

  async updateTeacher(id: string, data: { name: string; email: string; selectedGroups?: string[] }) {
    const response = await this.request(`/teachers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    this.clearCache('/teachers')
    return response
  }

  async deleteTeacher(id: string) {
    const response = await this.request(`/teachers/${id}`, {
      method: 'DELETE',
    });
    this.clearCache('/teachers')
    return response
  }

  async toggleTeacherActive(id: string) {
    const response = await this.request(`/teachers/${id}/toggle-active`, {
      method: 'PATCH',
    });
    this.clearCache('/teachers')
    return response
  }

  // Backup and Restore Methods
  async createSQLBackup() {
    const token = this.getAuthToken();
    const response = await fetch(`${this.baseURL}/backup/sql`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });

    if (response.ok) {
      return response;
    }

    // Fallback path for environments where pg_dump is unavailable.
    const fallbackResponse = await fetch(`${this.baseURL}/backups/create`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
    })

    if (!fallbackResponse.ok) {
      throw new Error('Failed to create SQL backup')
    }

    const fallbackPayload = await fallbackResponse.json()
    const backupData = fallbackPayload?.backupData

    if (!backupData) {
      throw new Error('Failed to create backup payload')
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `gradeflow-backup-${timestamp}.json`
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Backup-Format': 'json-fallback',
      },
    })
  }

  async restoreFromSQL(file: File, options?: { adminConfirmed?: boolean }) {
    const token = this.getAuthToken();
    const formData = new FormData();
    formData.append('backupFile', file);
    if (options?.adminConfirmed) {
      formData.append('adminConfirmed', 'true');
    }

    const response = await fetch(`${this.baseURL}/restore/sql`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to restore from SQL: ${errorText}`);
    }

    return response.json();
  }

  async restoreFromJSON(file: File, options: { mergeData?: boolean; updateSettings?: boolean } = {}) {
    const token = this.getAuthToken();
    const formData = new FormData();
    formData.append('backupFile', file);
    formData.append('mergeData', options.mergeData ? 'true' : 'false');
    formData.append('updateSettings', options.updateSettings ? 'true' : 'false');

    const response = await fetch(`${this.baseURL}/restore/json`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to restore from JSON: ${errorText}`);
    }

    return response.json();
  }

  // Metadata methods (replaces KV metadata operations)
  async getUserMetadata() {
    return this.request<{
      user_id: string;
      data_version: string;
      created_at: string;
      updated_at: string;
      student_count: number;
      subject_count: number;
      grade_count: number;
    }>('/metadata');
  }

  async getReportPreferences() {
    return this.request<{
      preferences: {
        groupSubjectOrder: Record<string, string[]>;
        subjectPreferences: Record<string, { displayMode: 'percentage' | 'letter' | 'gpa'; tier: 'primary' | 'secondary' }>;
        primaryWeightingEnabled: boolean;
        primaryWeightPercent: number;
      };
    }>('/metadata/report-preferences');
  }

  async updateReportPreferences(preferences: {
    groupSubjectOrder: Record<string, string[]>;
    subjectPreferences: Record<string, { displayMode: 'percentage' | 'letter' | 'gpa'; tier: 'primary' | 'secondary' }>;
    primaryWeightingEnabled: boolean;
    primaryWeightPercent: number;
  }) {
    return this.request<{
      preferences: {
        groupSubjectOrder: Record<string, string[]>;
        subjectPreferences: Record<string, { displayMode: 'percentage' | 'letter' | 'gpa'; tier: 'primary' | 'secondary' }>;
        primaryWeightingEnabled: boolean;
        primaryWeightPercent: number;
      };
    }>('/metadata/report-preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    });
  }

  async getDataStats() {
    return this.request<{
      totalUsers: number;
      totalStudents: number;
      totalSubjects: number;
      totalGrades: number;
      storageSize: number;
      lastBackup?: string;
    }>('/metadata/stats');
  }

  // Backup methods (replaces KV backup operations)
  async createBackup() {
    return this.request<{
      message: string;
      backup: {
        id: string;
        timestamp: string;
        createdAt: string;
        studentCount: number;
        subjectCount: number;
        gradeCount: number;
      };
    }>('/backups/create', { method: 'POST' });
  }

  async listBackups() {
    return this.request<Array<{
      id: string;
      timestamp: string;
      createdAt: string;
      metadata: {
        studentCount: number;
        subjectCount: number;
        gradeCount: number;
      };
    }>>('/backups/list');
  }

  async restoreFromBackup(timestamp: string) {
    return this.request<{
      message: string;
      restored: {
        studentCount: number;
        subjectCount: number;
        gradeCount: number;
      };
    }>(`/backups/restore/${timestamp}`, { method: 'POST' });
  }

  async deleteBackup(timestamp: string) {
    return this.request<{ message: string }>(`/backups/${timestamp}`, { method: 'DELETE' });
  }
}

// Create a singleton instance
export const apiClient = new ApiClient(API_BASE_URL);

// Custom hook for API calls with loading and error states
export function useApi<T>(
  apiCall: () => Promise<ApiResponse<T>>,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async () => {
    setLoading(true);
    setError(null);
    
    const response = await apiCall();
    
    if (response.error) {
      setError(response.error);
    } else {
      setData(response.data || null);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    refetch();
  }, dependencies);

  return { data, loading, error, refetch };
}

// Auth hook
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (apiClient.isAuthenticated()) {
        const response = await apiClient.getProfile();
        if (response.data) {
          setUser(response.data);
        } else {
          apiClient.logout();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiClient.login(email, password);
    if (response.data) {
      setUser(response.data.user);
      return { success: true };
    }
    return { success: false, error: response.error };
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await apiClient.register(email, password, name);
    if (response.data) {
      setUser(response.data.user);
      return { success: true };
    }
    return { success: false, error: response.error };
  };

  const logout = () => {
    apiClient.logout();
    setUser(null);
  };

  return { user, loading, login, register, logout };
}