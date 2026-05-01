// ============================================================
//  CASHFLOW.PK — Couriers Routes
//  File: cashflow-backend/src/routes/couriers.js
// ============================================================

const express  = require('express')
const supabase = require('../supabase')

const router = express.Router()

// ── Helper: get user from token ───────────────────────────────
async function getUserFromToken(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) { res.status(401).json({ error: 'No token' }); return null }
  try {
    // Primary: verify JWT token directly
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (!error && user) return user
    // Fallback: decode JWT manually to get user id
    // This handles edge cases where getUser fails but token is valid
    const base64Payload = token.split('.')[1]
    if (!base64Payload) {
      res.status(401).json({ error: 'Invalid token format' })
      return null
    }
    const payload = JSON.parse(
      Buffer.from(base64Payload, 'base64').toString('utf8')
    )
    // Check token expiry
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      res.status(401).json({ error: 'Token expired — please refresh the page' })
      return null
    }
    const userId = payload.sub
    if (!userId) {
      res.status(401).json({ error: 'Invalid token' })
      return null
    }
    // Get user from Supabase using service role
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !userData?.user) {
      res.status(401).json({ error: 'Invalid token' })
      return null
    }
    return userData.user
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
    return null
  }
}

// ── POST /couriers/postex/verify ──────────────────────────────
router.post('/postex/verify', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { apiToken } = req.body
    // Decode if token was Base64 encoded by browser
    let rawToken = apiToken?.trim() || ''
    try {
      const decoded = Buffer.from(rawToken, 'base64').toString('utf8')
      // If decoded is valid hex/alphanumeric (looks like a real token), use it
      if (decoded && /^[a-f0-9]{10,}$/i.test(decoded)) {
        rawToken = decoded
      }
    } catch { /* use rawToken as-is */ }
    console.log('[Postex Verify] apiToken received:', apiToken ? apiToken.substring(0, 20) + '...' : 'EMPTY')
    console.log('[Postex Verify] rawToken (decoded):', rawToken ? rawToken.substring(0, 20) + '...' : 'EMPTY')
    if (!rawToken) {
      return res.status(400).json({ error: 'API token is required' })
    }

    const fetch      = (await import('node-fetch')).default
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(
        'https://api.postex.pk/services/integration/api/order/v1/get-operational-cities',
        {
          method:  'GET',
          headers: { token: rawToken },
          signal:  controller.signal,
        }
      )
      clearTimeout(timer)

      const result = await response.json().catch(() => ({}))
      console.log('[Postex Verify] response status:', response.status, 'result:', JSON.stringify(result))

      if (response.status === 200 && result.statusCode === '200') {
        return res.json({ connected: true, message: 'Postex connected successfully' })
      }

      if (response.status === 401 || result.statusCode !== '200') {
        return res.json({ connected: false, error: 'Invalid API token — check your Postex credentials' })
      }

      return res.json({ connected: false, error: `Unexpected response from Postex (${response.status})` })
    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        return res.json({ connected: false, error: 'Could not reach Postex servers — check your internet connection' })
      }
      return res.json({ connected: false, error: 'Could not reach Postex servers — check your internet connection' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /couriers/postex/pickup-addresses ─────────────────────
router.get('/postex/pickup-addresses', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { apiToken } = req.query
    if (!apiToken?.trim()) {
      return res.status(400).json({ error: 'API token is required' })
    }

    const fetch = (await import('node-fetch')).default

    const response = await fetch(
      'https://api.postex.pk/services/integration/api/order/v1/get-merchant-address',
      {
        method:  'GET',
        headers: { token: apiToken.trim() },
      }
    )

    const result = await response.json().catch(() => ({}))

    if (response.ok) {
      return res.json({ addresses: result.dist || [] })
    }

    return res.json({ addresses: [], error: 'Could not fetch addresses' })
  } catch (err) {
    res.json({ addresses: [], error: 'Could not fetch addresses' })
  }
})

// ── POST /couriers/postex/create-order ───────────────────────
router.post('/postex/create-order', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const {
      apiToken,
      customerName,
      customerPhone,
      deliveryAddress,
      cityName,
      invoicePayment,
      orderDetail,
      orderRefNumber,
      pickupAddressCode,
    } = req.body

    const required = { apiToken, customerName, customerPhone, deliveryAddress, cityName, invoicePayment, orderRefNumber }
    for (const [key, val] of Object.entries(required)) {
      if (!val && val !== 0) {
        return res.status(400).json({ error: `${key} is required` })
      }
    }

    const fetch = (await import('node-fetch')).default

    const response = await fetch(
      'https://api.postex.pk/services/integration/api/order/v2/create-order',
      {
        method:  'POST',
        headers: {
          'token':        apiToken.trim(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerName,
          customerPhone,
          deliveryAddress,
          cityName,
          invoicePayment,
          orderDetail:       orderDetail       || '',
          orderRefNumber,
          pickupAddressCode: pickupAddressCode || '',
        }),
      }
    )

    const result = await response.json().catch(() => ({}))

    if (result.statusCode === '200') {
      return res.json({
        success:       true,
        trackingNumber: result.dist?.trackingNumber,
        data:          result.dist,
      })
    }

    return res.json({
      success: false,
      error:   result.statusMessage || 'Booking failed',
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /couriers/postex/track/:trackingNumber ────────────────
router.get('/postex/track/:trackingNumber', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { apiToken } = req.query
    const { trackingNumber } = req.params

    const fetch = (await import('node-fetch')).default

    const response = await fetch(
      `https://api.postex.pk/services/integration/api/order/v1/get-order-tracking?trackingNumber=${encodeURIComponent(trackingNumber)}`,
      {
        method:  'GET',
        headers: { token: apiToken || '' },
      }
    )

    const result = await response.json().catch(() => ({}))

    if (response.ok) {
      return res.json({ tracking: result.dist })
    }

    return res.json({ error: 'Tracking failed' })
  } catch (err) {
    res.json({ error: 'Tracking failed' })
  }
})

module.exports = router