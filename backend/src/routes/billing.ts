import express from 'express'
import Stripe from 'stripe'
import crypto from 'crypto'
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

const grantLicense = async (db: any, params: {
  userId: string
  schoolYearId: string
  grantSource: 'stripe' | 'free_trial'
  notes: string
}) => {
  const { userId, schoolYearId, grantSource, notes } = params

  const insertResult = await db.query(
    `INSERT INTO user_school_year_licenses (user_id, school_year_id, grant_source, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, school_year_id)
     DO UPDATE SET
       grant_source = EXCLUDED.grant_source,
       notes = EXCLUDED.notes,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [userId, schoolYearId, grantSource, notes]
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

    const stripe = getStripe()
    const frontendUrl = getFrontendUrl()
    const priceId = getRequiredPriceId(plan)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
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
      notes: `First year free claim for ${String(schoolName).trim()} (${String(country).trim()})`,
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
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      const schoolYearId = session.metadata?.schoolYearId

      if (!userId || !schoolYearId) {
        console.warn('[STRIPE WEBHOOK] Missing metadata on session:', session.id)
      } else {
        const db = getDB()
        await grantLicense(db, {
          userId,
          schoolYearId,
          grantSource: 'stripe',
          notes: `Stripe session ${session.id}`,
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
