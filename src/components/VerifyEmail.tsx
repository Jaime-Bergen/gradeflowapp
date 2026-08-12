import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('Verifying your email address...')

  const token = useMemo(() => searchParams.get('token') || '', [searchParams])

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus('error')
        setMessage('Verification link is missing a token.')
        return
      }

      const response = await apiClient.verifyEmail(token)
      if (response.error) {
        setStatus('error')
        setMessage(response.error)
        return
      }

      setStatus('success')
      setMessage(response.data?.message || 'Email verified successfully.')
      window.dispatchEvent(new CustomEvent('gradeflow-profile-updated'))
    }

    void run()
  }, [token])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className={status === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message}
          </p>

          <div className="flex gap-2">
            <Button onClick={() => navigate('/')}>Go To GradeFlow</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
