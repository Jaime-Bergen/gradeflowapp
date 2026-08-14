import express from 'express'
import Stripe from 'stripe'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { getDB } from '../database/connection'
import { AuthRequest, authenticateToken } from '../middleware/auth'

const router = express.Router()
const webhookRouter = express.Router()

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(secretKey)
}

const getFrontendUrl = () => {
  return (process.env.FRONTEND_URL || 'https://gradeflowapp.com').replace(/\/$/, '')
}

const getRequiredPriceId = (plan: 'full' | 'single') => {
  const priceId = plan === 'full'
    ? process.env.STRIPE_PRICE_ID_FULL
    : process.env.STRIPE_PRICE_ID_SINGLE

  if (!priceId) {
    throw new Error(`Missing Stripe price id for ${plan} plan`)
  }

  return priceId
}

const getSalesNotificationEmail = () => {
  return process.env.SALES_NOTIFICATION_EMAIL || 'sales@gradeflowapp.com'
}

const createMailerTransport = () => {
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)
  const smtpSecure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
    : smtpPort === 465

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const formatMoneyFromCents = (amount: number | null | undefined, currency: string | null | undefined) => {
  if (typeof amount !== 'number') return 'Unknown'
  const code = (currency || 'usd').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`
  }
}

const sendSalesPaymentNotification = async (params: {
  sessionId: string
  userId: string
  userEmail: string
  schoolYearLabel: string
  plan: string
  amountTotal: number | null | undefined
  currency: string | null | undefined
}) => {
  try {
    const to = getSalesNotificationEmail()
    const transporter = createMailerTransport()
    const amountDisplay = formatMoneyFromCents(params.amountTotal, params.currency)

    const subject = `New GradeFlow Payment: ${params.plan} (${params.schoolYearLabel})`
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color: #111827;">Payment Received</h2>
        <p>A Stripe payment has been confirmed and a license was granted.</p>
        <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
          <tr><td style="padding: 6px 8px; font-weight: 600;">Amount</td><td style="padding: 6px 8px;">${amountDisplay}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">Plan</td><td style="padding: 6px 8px;">${params.plan}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">School Year</td><td style="padding: 6px 8px;">${params.schoolYearLabel}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">User Email</td><td style="padding: 6px 8px;">${params.userEmail}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">User ID</td><td style="padding: 6px 8px;">${params.userId}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">Stripe Session</td><td style="padding: 6px 8px;">${params.sessionId}</td></tr>
        </table>
      </div>
    `

    const text = [
      'Payment Received',
      '',
      `Amount: ${amountDisplay}`,
      `Plan: ${params.plan}`,
      `School Year: ${params.schoolYearLabel}`,
      `User Email: ${params.userEmail}`,
      `User ID: ${params.userId}`,
      `Stripe Session: ${params.sessionId}`,
    ].join('\n')

    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || 'GradeFlow'}" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      html,
      text,
    })
  } catch (error) {
    console.error('[STRIPE WEBHOOK] Failed to send sales payment notification:', error)
  }
}

const sendSalesFreeLicenseNotification = async (params: {
  userId: string
  userEmail: string
  schoolYearLabel: string
  schoolName: string
  country: string
}) => {
  try {
    const to = getSalesNotificationEmail()
    const transporter = createMailerTransport()

    const subject = `New GradeFlow Free License: ${params.schoolYearLabel}`
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color: #111827;">Free License Claimed</h2>
        <p>A first-year free license has been claimed and activated.</p>
        <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
          <tr><td style="padding: 6px 8px; font-weight: 600;">School Year</td><td style="padding: 6px 8px;">${params.schoolYearLabel}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">School Name</td><td style="padding: 6px 8px;">${params.schoolName}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">Country</td><td style="padding: 6px 8px;">${params.country}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">User Email</td><td style="padding: 6px 8px;">${params.userEmail}</td></tr>
          <tr><td style="padding: 6px 8px; font-weight: 600;">User ID</td><td style="padding: 6px 8px;">${params.userId}</td></tr>
        </table>
      </div>
    `

    const text = [
      'Free License Claimed',
      '',
      `School Year: ${params.schoolYearLabel}`,
      `School Name: ${params.schoolName}`,
      `Country: ${params.country}`,
      `User Email: ${params.userEmail}`,
      `User ID: ${params.userId}`,
    ].join('\n')

    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || 'GradeFlow'}" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      html,
      text,
    })
  } catch (error) {
    console.error('[FREE LICENSE] Failed to send sales notification:', error)
  }
}

const grantLicense = async (db: any, params: {
  userId: string
  schoolYearId: string
  grantSource: 'stripe' | 'free_trial'
  licenseTier: 'full' | 'single'
  notes: string
}) => {
  const { userId, schoolYearId, grantSource, licenseTier, notes } = params

  const insertResult = await db.query(
    `INSERT INTO user_school_year_licenses (user_id, school_year_id, grant_source, license_tier, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, school_year_id)
     DO UPDATE SET
       grant_source = EXCLUDED.grant_source,
       license_tier = EXCLUDED.license_tier,
       notes = EXCLUDED.notes,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [userId, schoolYearId, grantSource, licenseTier, notes]
  )

  await db.query(
    `UPDATE users
     SET active_school_year_id = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId, schoolYearId]
  )

  return insertResult.rows[0]
}

const normalizeSchoolValue = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const createSchoolFingerprint = (schoolName: string, country: string) => {
  const normalizedSchool = normalizeSchoolValue(schoolName)
  const normalizedCountry = normalizeSchoolValue(country)
  return crypto
    .createHash('sha256')
    .update(`${normalizedSchool}|${normalizedCountry}`)
    .digest('hex')
}

router.post('/checkout-session', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { plan, schoolYearId } = req.body as { plan?: 'full' | 'single'; schoolYearId?: string }

    if (plan !== 'full' && plan !== 'single') {
      return res.status(400).json({ error: 'plan must be "full" or "single"' })
    }

    if (!schoolYearId) {
      return res.status(400).json({ error: 'schoolYearId is required' })
    }

    const db = getDB()
    const schoolYear = await db.query(
      `SELECT id, label FROM school_years WHERE id = $1`,
      [schoolYearId]
    )

    if (schoolYear.rows.length === 0) {
      return res.status(400).json({ error: 'Selected school year does not exist' })
    }

    const userResult = await db.query(
      `SELECT id, email, name, email_verified FROM users WHERE id = $1`,
      [req.userId]
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = userResult.rows[0]
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Email must be verified before purchase' })
    }

    const existingLicense = await db.query(
      `SELECT 1
       FROM user_school_year_licenses
       WHERE user_id = $1 AND school_year_id = $2
       LIMIT 1`,
      [req.userId, schoolYearId]
    )

    if (existingLicense.rows.length > 0) {
      return res.status(409).json({ error: 'You already own a license for this school year.' })
    }

    const stripe = getStripe()
    const frontendUrl = getFrontendUrl()
    const priceId = getRequiredPriceId(plan)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        schoolYearId,
        schoolYearLabel: schoolYear.rows[0].label,
        plan,
      },
      success_url: `${frontendUrl}/purchase?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/purchase?status=cancelled`,
    })

    res.json({ url: session.url })
  } catch (error) {
    next(error)
  }
})

router.get('/checkout-session-status', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const sessionId = String(req.query.sessionId || '').trim()
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    const metadataUserId = session.metadata?.userId || ''
    if (!metadataUserId || metadataUserId !== req.userId) {
      return res.status(403).json({ error: 'This checkout session does not belong to your account' })
    }

    const schoolYearId = session.metadata?.schoolYearId || ''
    const db = getDB()
    const licenseResult = schoolYearId
      ? await db.query(
          `SELECT id FROM user_school_year_licenses WHERE user_id = $1 AND school_year_id = $2 LIMIT 1`,
          [req.userId, schoolYearId]
        )
      : { rows: [] }

    const hasLicense = licenseResult.rows.length > 0
    const paid = session.payment_status === 'paid'

    res.json({
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      mode: session.mode,
      schoolYearId,
      hasLicense,
      paid,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/claim-free-year', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { schoolYearId, schoolName, country } = req.body as {
      schoolYearId?: string
      schoolName?: string
      country?: string
    }

    if (!schoolYearId) {
      return res.status(400).json({ error: 'schoolYearId is required' })
    }

    if (!schoolName || String(schoolName).trim().length < 3) {
      return res.status(400).json({ error: 'schoolName must be at least 3 characters' })
    }

    if (!country || String(country).trim().length < 2) {
      return res.status(400).json({ error: 'country is required' })
    }

    const db = getDB()

    const schoolYearResult = await db.query(
      `SELECT id, label FROM school_years WHERE id = $1`,
      [schoolYearId]
    )
    if (schoolYearResult.rows.length === 0) {
      return res.status(400).json({ error: 'Selected school year does not exist' })
    }

    const userResult = await db.query(
      `SELECT id, email, email_verified FROM users WHERE id = $1`,
      [req.userId]
    )
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = userResult.rows[0]
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Email must be verified before claiming free year' })
    }

    const existingLicense = await db.query(
      `SELECT 1
       FROM user_school_year_licenses
       WHERE user_id = $1 AND school_year_id = $2
       LIMIT 1`,
      [req.userId, schoolYearId]
    )

    if (existingLicense.rows.length > 0) {
      return res.status(409).json({ error: 'This school year is already licensed on your account.' })
    }

    // Users with any non-trial single/full license cannot claim a free year.
    const existingPaidOrGrantedLicense = await db.query(
      `SELECT 1
       FROM user_school_year_licenses
       WHERE user_id = $1
         AND license_tier IN ('single', 'full')
         AND COALESCE(grant_source, '') <> 'trial'
       LIMIT 1`,
      [req.userId]
    )

    if (existingPaidOrGrantedLicense.rows.length > 0) {
      return res.status(409).json({
        error: 'Free year is only available before you have a single or full license. Please choose a paid plan or contact sales.'
      })
    }

    const fingerprint = createSchoolFingerprint(String(schoolName), String(country))

    try {
      await db.query(
        `INSERT INTO free_school_year_claims (user_id, school_year_id, school_name, country, school_fingerprint, claim_source, notes)
         VALUES ($1, $2, $3, $4, $5, 'self_service', $6)`,
        [
          req.userId,
          schoolYearId,
          String(schoolName).trim(),
          String(country).trim(),
          fingerprint,
          `Free year claimed by ${user.email}`,
        ]
      )
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({
          error: 'A free year has already been claimed for this school identity. Please choose a paid plan or contact sales for help.'
        })
      }
      throw error
    }

    await grantLicense(db, {
      userId: req.userId!,
      schoolYearId,
      grantSource: 'free_trial',
      licenseTier: 'full',
      notes: `First year free claim for ${String(schoolName).trim()} (${String(country).trim()})`,
    })

    await sendSalesFreeLicenseNotification({
      userId: req.userId!,
      userEmail: user.email,
      schoolYearLabel: schoolYearResult.rows[0].label,
      schoolName: String(schoolName).trim(),
      country: String(country).trim(),
    })

    res.json({
      message: `Free year activated for ${schoolYearResult.rows[0].label}.`,
      activeSchoolYearLabel: schoolYearResult.rows[0].label,
    })
  } catch (error) {
    next(error)
  }
})

webhookRouter.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = req.headers['stripe-signature']

  if (!webhookSecret) {
    console.error('[STRIPE WEBHOOK] Missing STRIPE_WEBHOOK_SECRET')
    return res.status(500).send('Webhook secret missing')
  }

  if (!signature || typeof signature !== 'string') {
    return res.status(400).send('Missing stripe-signature header')
  }

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret)
  } catch (error: any) {
    console.error('[STRIPE WEBHOOK] Signature verification failed:', error?.message)
    return res.status(400).send(`Webhook Error: ${error?.message || 'invalid signature'}`)
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      const schoolYearId = session.metadata?.schoolYearId
      const schoolYearLabel = session.metadata?.schoolYearLabel || schoolYearId || 'Unknown'
      const plan = session.metadata?.plan || 'unknown'

      if (session.mode === 'payment' && session.payment_status !== 'paid') {
        console.log(
          `[STRIPE WEBHOOK] Session not paid yet, skipping grant session=${session.id} payment_status=${session.payment_status}`
        )
        return res.json({ received: true })
      }

      if (!userId || !schoolYearId) {
        console.warn('[STRIPE WEBHOOK] Missing metadata on session:', session.id)
      } else {
        const db = getDB()
        const note = `Stripe session ${session.id}`
        const existingSessionGrant = await db.query(
          `SELECT id
           FROM user_school_year_licenses
           WHERE user_id = $1 AND school_year_id = $2 AND notes = $3
           LIMIT 1`,
          [userId, schoolYearId, note]
        )

        if (existingSessionGrant.rows.length > 0) {
          return res.json({ received: true })
        }

        await grantLicense(db, {
          userId,
          schoolYearId,
          grantSource: 'stripe',
          licenseTier: plan === 'single' ? 'single' : 'full',
          notes: note,
        })

        await sendSalesPaymentNotification({
          sessionId: session.id,
          userId,
          userEmail: session.customer_details?.email || session.customer_email || 'unknown',
          schoolYearLabel,
          plan,
          amountTotal: session.amount_total,
          currency: session.currency,
        })

        console.log(`[STRIPE WEBHOOK] License granted user=${userId} schoolYear=${schoolYearId} session=${session.id}`)
      }
    }

    res.json({ received: true })
  } catch (error) {
    console.error('[STRIPE WEBHOOK] Handler error:', error)
    res.status(500).send('Webhook handler failed')
  }
})

export { router as billingRoutes, webhookRouter as billingWebhookRoutes }
