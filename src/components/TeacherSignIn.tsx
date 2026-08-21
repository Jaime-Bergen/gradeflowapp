import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api'

// Decodes the JWT payload without verifying it (server verifies on every real request).
const decodeTokenPayload = (token: string): any => {
  try {
    const [, payload] = token.split('.')
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(normalized)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export default function TeacherSignIn() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('Signing you in...')

  const token = useMemo(() => searchParams.get('token') || '', [searchParams])

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus('error')
        setMessage('Sign-in link is missing a token.')
        return
      }

      const payload = decodeTokenPayload(token)
      if (payload?.purpose !== 'teacher_signin') {
        setStatus('error')
        setMessage('This sign-in link is invalid.')
        return
      }

      apiClient.setToken(token)
      const response = await apiClient.getProfile()
      if (response.error) {
        apiClient.clearToken()
        setStatus('error')
        setMessage('This sign-in link has expired or is no longer valid. Ask your admin to send a new one.')
        return
      }

      if (payload.teacherId) {
        localStorage.setItem('selectedTeacherId', payload.teacherId)
        window.dispatchEvent(new CustomEvent('teacher-selection-changed'))
      }

      setStatus('success')
      setMessage('Signed in successfully.')
      setTimeout(() => navigate('/'), 800)
    }

    void run()
  }, [token, navigate])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Teacher Sign-In</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className={status === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message}
          </p>

          {status === 'error' && (
            <div className="flex gap-2">
              <Button onClick={() => navigate('/')}>Go To GradeFlow</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
