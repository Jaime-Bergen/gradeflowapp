import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, GraduationCap, User, Users } from "lucide-react"
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { SchoolYear } from '@/lib/types'

const SUPPORT_EMAIL = 'sales@gradeflowapp.com'

const getPreferredSchoolYearId = (years: SchoolYear[]): string => {
  if (!Array.isArray(years) || years.length === 0) return ''

  const now = new Date()

  const normalized = years
    .map((year) => ({
      id: year.id,
      start: new Date(year.start_date),
      end: new Date(year.end_date),
    }))
    .filter((year) => !Number.isNaN(year.start.getTime()) && !Number.isNaN(year.end.getTime()))

  // Prefer the currently active term first.
  const current = normalized.find((year) => year.start <= now && now <= year.end)
  if (current) return current.id

  // Otherwise pick the nearest upcoming term.
  const upcoming = normalized
    .filter((year) => year.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0]

  if (upcoming) return upcoming.id

  // If all terms are historical, pick the most recent one.
  const mostRecentPast = normalized
    .filter((year) => year.end < now)
    .sort((a, b) => b.end.getTime() - a.end.getTime())[0]

  return mostRecentPast?.id || years[0].id
}

export default function Purchase() {
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [emailVerified, setEmailVerified] = useState<boolean>(false)
  const [ownedSchoolYearIds, setOwnedSchoolYearIds] = useState<string[]>([])
  const [isLoadingAccount, setIsLoadingAccount] = useState(true)
  const [availableSchoolYears, setAvailableSchoolYears] = useState<SchoolYear[]>([])
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolCountry, setSchoolCountry] = useState('')
  const [isSendingVerification, setIsSendingVerification] = useState(false)
  const [isStartingCheckout, setIsStartingCheckout] = useState<'full' | 'single' | null>(null)
  const [isClaimingFreeYear, setIsClaimingFreeYear] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusType, setStatusType] = useState<'success' | 'info' | null>(null)
  const [isCheckingCheckoutStatus, setIsCheckingCheckoutStatus] = useState(false)

  const hasAnyOwnedLicense = ownedSchoolYearIds.length > 0
  const isSelectedYearOwned = selectedSchoolYearId ? ownedSchoolYearIds.includes(selectedSchoolYearId) : false
  const canPurchase = !isLoadingAccount && !!accountEmail && emailVerified && !!selectedSchoolYearId && !isSelectedYearOwned

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('status')
    const sessionId = params.get('session_id') || ''

    if (status === 'success' && sessionId) {
      const checkSession = async () => {
        try {
          setIsCheckingCheckoutStatus(true)
          const response = await apiClient.getBillingCheckoutSessionStatus(sessionId)
          if (response.error) {
            setStatusType('info')
            setStatusMessage('Payment return detected, but we could not verify checkout status yet. Please refresh in a moment.')
            return
          }

          const data = response.data
          if (data?.paid && data?.hasLicense) {
            setStatusType('success')
            setStatusMessage('Payment complete and license activated. Use the button below to return to the app.')
          } else if (data?.paid && !data?.hasLicense) {
            setStatusType('info')
            setStatusMessage('Payment completed. Your license is still being applied. Please refresh in a few seconds.')
          } else {
            setStatusType('info')
            setStatusMessage('Checkout was not completed as a paid purchase. No license was added.')
          }
        } catch (error) {
          setStatusType('info')
          setStatusMessage('Could not verify checkout status yet. Please refresh in a moment.')
        } finally {
          setIsCheckingCheckoutStatus(false)
        }
      }

      void checkSession()
    } else if (status === 'cancelled') {
      setStatusType('info')
      setStatusMessage('Checkout was cancelled. You can choose another option when you are ready.')
    }
  }, [])

  useEffect(() => {
    const loadAccount = async () => {
      if (!apiClient.isAuthenticated()) {
        setAccountEmail(null)
        setEmailVerified(false)
        setIsLoadingAccount(false)
        return
      }

      try {
        const yearsResponse = await apiClient.getAvailableSchoolYears()
        const years = Array.isArray(yearsResponse.data) ? yearsResponse.data : []

        const profile = await apiClient.getProfile()
        const data = (profile.data as any) || {}
        setAccountEmail(data.email || null)
        setEmailVerified(Boolean(data.email_verified))
        setSchoolName((data.school_name || '').trim())
        const ownedYears = Array.isArray(data.licensed_school_years)
          ? data.licensed_school_years.map((year: any) => String(year.id))
          : []
        setOwnedSchoolYearIds(ownedYears)
        setAvailableSchoolYears(years)
        if (years.length > 0) {
          const preferred = getPreferredSchoolYearId(years)
          const fallbackUnowned = years.find((year) => !ownedYears.includes(String(year.id)))
          setSelectedSchoolYearId(
            ownedYears.includes(preferred) ? (fallbackUnowned?.id || preferred) : preferred
          )
        }
      } catch (error) {
        console.error('Failed to load account for purchase page:', error)
      } finally {
        setIsLoadingAccount(false)
      }
    }

    void loadAccount()
  }, [])

  const resendVerification = async () => {
    if (!accountEmail || emailVerified) return
    try {
      setIsSendingVerification(true)
      const response = await apiClient.sendVerificationEmail()
      if (response.error) {
        toast.error(response.error)
        return
      }
      toast.success(response.data?.message || 'Verification email sent.')
    } catch (error) {
      console.error('Failed to resend verification email:', error)
      toast.error('Failed to send verification email.')
    } finally {
      setIsSendingVerification(false)
    }
  }

  const startCheckout = async (plan: 'full' | 'single') => {
    if (!canPurchase || !selectedSchoolYearId) {
      toast.error('Please verify your email and select a school year first.')
      return
    }

    try {
      setIsStartingCheckout(plan)
      const response = await apiClient.createBillingCheckoutSession({ plan, schoolYearId: selectedSchoolYearId })
      if (response.error) {
        toast.error(response.error)
        return
      }

      const checkoutUrl = response.data?.url
      if (!checkoutUrl) {
        toast.error('Unable to start checkout right now.')
        return
      }

      window.location.href = checkoutUrl
    } catch (error) {
      console.error('Failed to start checkout:', error)
      toast.error('Failed to start checkout.')
    } finally {
      setIsStartingCheckout(null)
    }
  }

  const claimFreeYear = async () => {
    if (!canPurchase) {
      toast.error('Please verify your email and select a school year first.')
      return
    }

    if (schoolName.trim().length < 3) {
      toast.error('Enter your school name to claim the free year.')
      return
    }

    if (schoolCountry.trim().length < 2) {
      toast.error('Enter your country to claim the free year.')
      return
    }

    try {
      setIsClaimingFreeYear(true)
      const response = await apiClient.claimFreeYearLicense({
        schoolYearId: selectedSchoolYearId,
        schoolName: schoolName.trim(),
        country: schoolCountry.trim(),
      })

      if (response.error) {
        toast.error(response.error)
        return
      }

      toast.success(response.data?.message || 'Free year activated successfully.')
      setStatusType('success')
      setStatusMessage('Free year activated successfully. Use the button below to return to the app.')
      window.dispatchEvent(new CustomEvent('gradeflow-profile-updated'))
      setOwnedSchoolYearIds((prev) => (prev.includes(selectedSchoolYearId) ? prev : [...prev, selectedSchoolYearId]))
    } catch (error) {
      console.error('Failed to claim free year:', error)
      toast.error('Failed to claim free year.')
    } finally {
      setIsClaimingFreeYear(false)
    }
  }

  const selectedYear = availableSchoolYears.find((year) => year.id === selectedSchoolYearId)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <GraduationCap size={32} className="text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">GradeFlowApp Licensing</h1>
              <p className="text-sm text-muted-foreground">Choose the plan that fits your classroom setup</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {statusMessage && (
          <Card className={statusType === 'success' ? 'border-emerald-300 bg-emerald-50' : 'border-blue-200 bg-blue-50'}>
            <CardContent className="pt-6 space-y-3">
              <p className={statusType === 'success' ? 'text-sm text-emerald-900' : 'text-sm text-blue-900'}>{statusMessage}</p>
              {isCheckingCheckoutStatus && (
                <p className="text-xs text-blue-900">Verifying payment status with Stripe...</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href="/">Return To GradeFlow App</a>
                </Button>
                <Button variant="outline" onClick={() => {
                  setStatusMessage(null)
                  setStatusType(null)
                }}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="pt-6 space-y-3 text-sm text-blue-900">
            <p className="font-medium">Before You Purchase</p>

            <div className="rounded-md border border-blue-200 bg-white/70 p-3">
              <p className="text-xs uppercase tracking-wide text-blue-700 mb-1">Account receiving this license</p>
              {isLoadingAccount ? (
                <p className="font-medium">Checking your signed-in account...</p>
              ) : accountEmail ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{accountEmail}</p>
                  <Badge variant={emailVerified ? 'default' : 'outline'} className={emailVerified ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100' : ''}>
                    {emailVerified ? 'Email Verified' : 'Email Not Verified'}
                  </Badge>
                </div>
              ) : (
                <p className="font-medium text-amber-800">No signed-in account detected. Please sign in first.</p>
              )}
            </div>

            <ol className="list-decimal pl-5 space-y-1">
              <li>Sign in on gradeflowapp.com with the exact account that should receive the license.</li>
              <li>Confirm the email above is correct before selecting a plan.</li>
              <li>Verify that email address before purchasing.</li>
              <li>Select the school year you want to license.</li>
              <li>Complete checkout. The selected year will auto-activate after payment confirmation.</li>
            </ol>

            <div className="space-y-2 rounded-md border border-blue-200 bg-white/70 p-3">
              <p className="text-xs uppercase tracking-wide text-blue-700">School year to license</p>
              <Select value={selectedSchoolYearId || undefined} onValueChange={setSelectedSchoolYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select school year" />
                </SelectTrigger>
                <SelectContent>
                  {availableSchoolYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedYear && (
                <p className="text-xs text-blue-800">Selected: {selectedYear.label}</p>
              )}
              {isSelectedYearOwned && (
                <p className="text-xs text-amber-800">You already own this school year. Select a different year to purchase or claim free access.</p>
              )}
            </div>

            {!hasAnyOwnedLicense && (
              <div className="space-y-2 rounded-md border border-blue-200 bg-white/70 p-3">
                <p className="text-xs uppercase tracking-wide text-blue-700">School identity for free-year eligibility</p>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="School name"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={schoolCountry}
                  onChange={(e) => setSchoolCountry(e.target.value)}
                  placeholder="Country"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-blue-800">First year free can be claimed once per school identity.</p>
              </div>
            )}

            {!canPurchase && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 space-y-2">
                <p>
                  {isSelectedYearOwned
                    ? 'This year is already licensed on your account. Choose a different school year to continue.'
                    : 'Purchases are locked until you are signed in with a verified email address.'}
                </p>
                {accountEmail && !emailVerified && (
                  <Button size="sm" variant="outline" onClick={resendVerification} disabled={isSendingVerification}>
                    {isSendingVerification ? 'Sending...' : 'Resend Verification Email'}
                  </Button>
                )}
              </div>
            )}

            <p>If you have any questions, check the Help section or email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
            <p className="text-xs text-blue-800">Business name for checkout: GradeFlowApp. Prices shown are tax-exclusive.</p>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {!hasAnyOwnedLicense && (
            <Card className="border-blue-200 md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 size={18} />
                    First Year Free
                  </CardTitle>
                  <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">One Per School</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-foreground">
                  Claim one free school year for your school identity. Your selected year will activate immediately if eligible.
                </p>
                {canPurchase ? (
                  <Button className="w-full" variant="secondary" onClick={() => { void claimFreeYear() }} disabled={isClaimingFreeYear || isStartingCheckout !== null}>
                    {isClaimingFreeYear ? 'Activating Free Year...' : 'Claim First Year Free'}
                  </Button>
                ) : (
                  <Button className="w-full" variant="secondary" disabled>
                    Verify Email + Select Year To Claim
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-emerald-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users size={18} />
                  Full School License
                </CardTitle>
                <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Best For Teams</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-bold text-foreground">$135 ($15/mo for 9 months)</p>
                <p className="text-sm text-muted-foreground">one-time for one school term, tax exclusive</p>
              </div>

              <ul className="space-y-2 text-sm text-foreground">
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />One school account, unlimited teacher accounts</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />Collaboration and teacher assignment tools</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />12-month access window</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />Full school-year licensing access</li>
              </ul>

              {canPurchase ? (
                <Button className="w-full" onClick={() => { void startCheckout('full') }} disabled={isStartingCheckout === 'single' || isStartingCheckout === 'full'}>
                  {isStartingCheckout === 'full' ? 'Redirecting...' : 'Buy Full School License'}
                </Button>
              ) : (
                <Button className="w-full" disabled>
                  Verify Email + Select Year To Buy
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User size={18} />
                Single Teacher License
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-bold text-foreground">$72 ($8/mo for 9 months)</p>
                <p className="text-sm text-muted-foreground">one-time for one school term, tax exclusive</p>
              </div>

              <ul className="space-y-2 text-sm text-foreground">
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 text-blue-600" />Single-teacher mode</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 text-blue-600" />No collaboration features</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 text-blue-600" />Access includes 12 months from July</li>
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 text-blue-600" />Adding more teachers in Settings is disabled</li>
              </ul>

              {canPurchase ? (
                <Button variant="outline" className="w-full" onClick={() => { void startCheckout('single') }} disabled={isStartingCheckout === 'single' || isStartingCheckout === 'full'}>
                  {isStartingCheckout === 'single' ? 'Redirecting...' : 'Buy Single Teacher License'}
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  Verify Email + Select Year To Buy
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
