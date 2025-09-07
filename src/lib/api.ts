import { useState, useEffect } from 'react';
import { Grade, User } from '@/lib/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

class ApiClient {
  async deleteLesson(lessonId: string) {
    return this.request(`/lessons/${lessonId}`, {
      method: 'DELETE',
    });
  }
  async updateLesson(lessonId: string, data: Partial<{ name: string; categoryId: string; points: number; orderIndex: number }>) {
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

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const token = this.token || localStorage.getItem('auth_token');
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

  async getProfile() {
    return this.request<User>('/users/profile');
  }

  async updateProfile(data: { 
    name?: string; 
    school_name?: string; 
    first_day_of_school?: string; 
    grading_periods?: number 
  }) {
    return this.request<User>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
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

  // Delete current user account and all data
  async deleteMyAccount(confirmPassword: string) {
    return this.request<{ message: string }>('/users/account', {
      method: 'DELETE',
      body: JSON.stringify({ confirmPassword }),
    });
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  // Students
  async getStudents(groupId?: string) {
    const params = groupId ? `?groupId=${groupId}` : '';
    return this.request(`/students${params}`);
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

  // Update subjects for a student
  async updateStudentSubjects(studentId: string, data: { subjects: string[] }) {
    return this.request(`/students/${studentId}/subjects`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Student Groups
  async getStudentGroups() {
    return this.request('/students/groups');
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
  async getSubjects(groupId?: string) {
    const params = groupId ? `?groupId=${groupId}` : '';
    return this.request(`/subjects${params}`);
  }

  async createSubject(data: any) {
    return this.request('/subjects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSubject(id: string, data: any) {
    return this.request(`/subjects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSubject(id: string) {
    return this.request(`/subjects/${id}`, {
      method: 'DELETE',
    });
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
    return this.request(`/subjects/${subjectId}/lessons/bulk`, {
      method: 'POST',
      body: JSON.stringify({ count, namePrefix, type, points, categoryId }),
    });
  }

  async getLessonsForSubject(subjectId: string) {
    return this.request(`/lessons/subject/${subjectId}`);
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

  // Backup and Restore Methods
  async createSQLBackup() {
    const response = await fetch(`${this.baseURL}/backup/sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to create SQL backup');
    }

    return response;
  }

  async restoreFromSQL(file: File, options?: { adminConfirmed?: boolean }) {
    const formData = new FormData();
    formData.append('backupFile', file);
    if (options?.adminConfirmed) {
      formData.append('adminConfirmed', 'true');
    }

    const response = await fetch(`${this.baseURL}/restore/sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
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
    const formData = new FormData();
    formData.append('backupFile', file);
    formData.append('mergeData', options.mergeData ? 'true' : 'false');
    formData.append('updateSettings', options.updateSettings ? 'true' : 'false');

    const response = await fetch(`${this.baseURL}/restore/json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
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