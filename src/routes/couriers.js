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
    if (!apiToken?.trim()) {
      return res.status(400).json({ error: 'API token is required' })
    }

    const fetch      = (await import('node-fetch')).default
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(
        'https://api.postex.pk/services/integration/api/order/v2/get-operational-city',
        {
          method:  'GET',
          headers: { token: apiToken.trim() },
          signal:  controller.signal,
        }
      )
      clearTimeout(timer)

      const result = await response.json().catch(() => ({}))
      console.log('[Postex Verify] status:', response.status, 'result:', JSON.stringify(result))

      if (response.status === 200 && result.statusCode === '200') {
        return res.json({ connected: true, message: 'Postex connected successfully' })
      }

      return res.json({ connected: false, error: 'Invalid API token — check your Postex credentials' })
    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        return res.json({ connected: false, error: 'Could not reach Postex servers — check your internet connection' })
      }
      return res.json({ connected: false, error: 'Could not reach Postex servers: ' + err.message })
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
      'https://api.postex.pk/services/integration/api/order/v3/create-order',
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
          orderType:         'Normal',
          pickupAddressCode: pickupAddressCode || '',
        }),
      }
    )

    const result = await response.json().catch(() => ({}))
    console.log('[Postex] status:', response.status, 'body:', JSON.stringify(result))

    if (result.statusCode === '200') {
      return res.json({
        success:        true,
        trackingNumber: result.dist?.trackingNumber,
        data:           result.dist,
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
      `https://api.postex.pk/services/integration/api/order/v1/track-order/${encodeURIComponent(trackingNumber)}`,
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

// ── GET /couriers/postex/cities ──────────────────────────────
router.get('/postex/cities', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { apiToken } = req.query
    if (!apiToken?.trim()) return res.status(400).json({ error: 'API token is required' })

    const fetch = (await import('node-fetch')).default
    const response = await fetch(
      'https://api.postex.pk/services/integration/api/order/v2/get-operational-city',
      { method: 'GET', headers: { token: apiToken.trim() } }
    )
    const result = await response.json().catch(() => ({}))

    if (result.statusCode === '200') {
      return res.json({ cities: result.dist || [] })
    }
    return res.json({ cities: [], error: result.statusMessage || 'Could not fetch cities' })
  } catch (err) {
    res.json({ cities: [], error: err.message })
  }
})

// ── POST /couriers/bookings/save ──────────────────────────────
router.post('/bookings/save', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const org_id = profile?.org_id
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const {
      tracking_number, courier_slug, order_ref,
      recipient_name, recipient_phone, recipient_city, recipient_address,
      weight, cod_amount, pieces, postex_data, store_id,
    } = req.body

    const { data, error } = await supabase
      .from('courier_bookings')
      .insert({
        org_id,
        store_id:         store_id || null,
        tracking_number,
        courier_slug,
        order_ref,
        recipient_name,
        recipient_phone,
        recipient_city,
        recipient_address,
        weight:           weight    || null,
        cod_amount:       cod_amount || 0,
        pieces:           pieces    || 1,
        status:           'pending',
        postex_data:      postex_data || null,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, booking: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /couriers/bookings ────────────────────────────────────
router.get('/bookings', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const org_id = profile?.org_id
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const page     = parseInt(req.query.page)     || 1
    const per_page = parseInt(req.query.per_page) || 50
    const courier  = req.query.courier
    const status   = req.query.status
    const search   = req.query.search

    const from = (page - 1) * per_page
    const to   = from + per_page - 1

    let query = supabase
      .from('courier_bookings')
      .select('*', { count: 'exact' })
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (courier) query = query.eq('courier_slug', courier)
    if (status)  query = query.eq('status', status)
    if (search)  query = query.or(`tracking_number.ilike.%${search}%,recipient_name.ilike.%${search}%`)

    const { data: bookings, count, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    return res.json({ bookings, total: count, page, per_page })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /couriers/bookings/bulk-save ────────────────────────
router.post('/bookings/bulk-save', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const org_id = profile?.org_id
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const { bookings } = req.body
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res.status(400).json({ error: 'bookings array is required' })
    }

    const rows = bookings.map(b => ({
      org_id,
      store_id:         b.store_id         || null,
      tracking_number:  b.tracking_number  || null,
      courier_slug:     b.courier_slug     || 'postex',
      order_ref:        b.order_ref        || null,
      recipient_name:   b.recipient_name   || null,
      recipient_phone:  b.recipient_phone  || null,
      recipient_city:   b.recipient_city   || null,
      recipient_address:b.recipient_address|| null,
      weight:           b.weight           || null,
      cod_amount:       b.cod_amount       || 0,
      pieces:           b.pieces           || 1,
      status:           b.status           || 'pending',
      postex_data:      b.postex_data      || null,
    }))

    const { data, error } = await supabase
      .from('courier_bookings')
      .insert(rows)
      .select()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, saved: data.length, bookings: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router