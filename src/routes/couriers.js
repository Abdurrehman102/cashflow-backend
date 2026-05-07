// ============================================================
//  CASHFLOW.PK — Couriers Router
//  File: cashflow-backend/src/routes/couriers.js
//  Sirf routing — sab logic service files mein hai
// ============================================================

const express   = require('express')
const supabase  = require('../supabase')
const postex    = require('../couriers/postex.service')
const leopards  = require('../couriers/leopards.service')
const tcs       = require('../couriers/tcs.service')
const trax      = require('../couriers/trax.service')
const mnp       = require('../couriers/mnp.service')
const pakpost   = require('../couriers/pakpost.service')

const router = express.Router()

// ── Helper: get user from token ───────────────────────────────
async function getUserFromToken(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) { res.status(401).json({ error: 'No token' }); return null }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (!error && user) return user
    const base64Payload = token.split('.')[1]
    if (!base64Payload) { res.status(401).json({ error: 'Invalid token format' }); return null }
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'))
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) { res.status(401).json({ error: 'Token expired — please refresh the page' }); return null }
    const userId = payload.sub
    if (!userId) { res.status(401).json({ error: 'Invalid token' }); return null }
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !userData?.user) { res.status(401).json({ error: 'Invalid token' }); return null }
    return userData.user
  } catch { res.status(401).json({ error: 'Invalid token' }); return null }
}

// ─────────────────────────────────────────────────────────────
//  POSTEX
// ─────────────────────────────────────────────────────────────

router.post('/postex/verify', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { apiToken } = req.body
    if (!apiToken?.trim()) return res.status(400).json({ error: 'API token is required' })
    return res.json(await postex.verify(apiToken))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/postex/cities', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { apiToken } = req.query
    if (!apiToken?.trim()) return res.status(400).json({ error: 'API token is required' })
    return res.json(await postex.getCities(apiToken))
  } catch (err) { res.json({ cities: [], error: err.message }) }
})

router.get('/postex/pickup-addresses', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { apiToken } = req.query
    if (!apiToken?.trim()) return res.status(400).json({ error: 'API token is required' })
    return res.json(await postex.getPickupAddresses(apiToken))
  } catch (err) { res.json({ addresses: [], error: err.message }) }
})

router.post('/postex/create-order', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { apiToken, customerName, customerPhone, deliveryAddress, cityName, invoicePayment, orderRefNumber } = req.body
    const required = { apiToken, customerName, customerPhone, deliveryAddress, cityName, invoicePayment, orderRefNumber }
    for (const [key, val] of Object.entries(required))
      if (!val && val !== 0) return res.status(400).json({ error: `${key} is required` })
    return res.json(await postex.createOrder(req.body))
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/postex/track/:trackingNumber', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    return res.json(await postex.trackOrder(req.query.apiToken, req.params.trackingNumber))
  } catch { res.json({ error: 'Tracking failed' }) }
})

// ─────────────────────────────────────────────────────────────
//  LEOPARDS
// ─────────────────────────────────────────────────────────────

router.post('/leopards/verify', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { apiKey, apiPassword } = req.body
    if (!apiKey?.trim() || !apiPassword?.trim()) return res.status(400).json({ error: 'API Key and Password required' })
    return res.json(await leopards.verify(apiKey, apiPassword))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/leopards/create-order', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    return res.json(await leopards.createOrder(req.body))
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/leopards/track/:trackingNumber', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { apiKey, apiPassword } = req.query
    return res.json(await leopards.trackOrder(apiKey, apiPassword, req.params.trackingNumber))
  } catch { res.json({ error: 'Tracking failed' }) }
})

// ─────────────────────────────────────────────────────────────
//  TCS
// ─────────────────────────────────────────────────────────────

router.post('/tcs/verify', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { username, password, costCenterId } = req.body
    if (!username?.trim() || !password?.trim()) return res.status(400).json({ error: 'Username and Password required' })
    return res.json(await tcs.verify(username, password, costCenterId))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/tcs/create-order', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    return res.json(await tcs.createOrder(req.body))
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/tcs/track/:trackingNumber', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { username, password } = req.query
    return res.json(await tcs.trackOrder(username, password, req.params.trackingNumber))
  } catch { res.json({ error: 'Tracking failed' }) }
})

// ─────────────────────────────────────────────────────────────
//  TRAX
// ─────────────────────────────────────────────────────────────

router.post('/trax/verify', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { apiKey } = req.body
    if (!apiKey?.trim()) return res.status(400).json({ error: 'API Key required' })
    return res.json(await trax.verify(apiKey))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/trax/create-order', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    return res.json(await trax.createOrder(req.body))
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/trax/track/:trackingNumber', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    return res.json(await trax.trackOrder(req.query.apiKey, req.params.trackingNumber))
  } catch { res.json({ error: 'Tracking failed' }) }
})

// ─────────────────────────────────────────────────────────────
//  MNP
// ─────────────────────────────────────────────────────────────

router.post('/mnp/verify', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { apiKey, accountCode } = req.body
    if (!apiKey?.trim() || !accountCode?.trim()) return res.status(400).json({ error: 'API Key and Account Code required' })
    return res.json(await mnp.verify(apiKey, accountCode))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/mnp/create-order', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    return res.json(await mnp.createOrder(req.body))
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/mnp/track/:trackingNumber', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    return res.json(await mnp.trackOrder(req.query.apiKey, req.params.trackingNumber))
  } catch { res.json({ error: 'Tracking failed' }) }
})

// ─────────────────────────────────────────────────────────────
//  PAKPOST
// ─────────────────────────────────────────────────────────────

router.post('/pakpost/verify', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { username, password } = req.body
    if (!username?.trim() || !password?.trim()) return res.status(400).json({ error: 'Username and Password required' })
    return res.json(await pakpost.verify(username, password))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/pakpost/create-order', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    return res.json(await pakpost.createOrder(req.body))
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

router.get('/pakpost/track/:trackingNumber', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { username, password } = req.query
    return res.json(await pakpost.trackOrder(username, password, req.params.trackingNumber))
  } catch { res.json({ error: 'Tracking failed' }) }
})

// ─────────────────────────────────────────────────────────────
//  BOOKINGS (DB)
// ─────────────────────────────────────────────────────────────

router.post('/bookings/save', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const org_id = profile?.org_id
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })
    const {
      tracking_number, courier_slug, order_ref,
      recipient_name, recipient_phone, recipient_city, recipient_address,
      weight, cod_amount, cod_status, advance_amount, advance_status,
      pieces, postex_data, store_id, shipping_date,
    } = req.body
    const { data, error } = await supabase.from('courier_bookings').insert({
      org_id, store_id: store_id || null, tracking_number, courier_slug, order_ref,
      recipient_name, recipient_phone, recipient_city, recipient_address,
      weight: weight || null, booking_date: new Date().toISOString(),
      shipping_date: shipping_date || null,
      cod_amount: cod_amount || 0, cod_status: cod_status || 'pending',
      advance_amount: advance_amount || 0, advance_status: advance_status || null,
      pieces: pieces || 1, status: 'pending', postex_data: postex_data || null,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, booking: data })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/bookings', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const org_id = profile?.org_id
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })
    const page     = parseInt(req.query.page)     || 1
    const per_page = parseInt(req.query.per_page) || 50
    const from = (page - 1) * per_page
    const to   = from + per_page - 1
    let query = supabase.from('courier_bookings').select('*', { count: 'exact' }).eq('org_id', org_id).order('created_at', { ascending: false }).range(from, to)
    if (req.query.courier) query = query.eq('courier_slug', req.query.courier)
    if (req.query.status)  query = query.eq('status', req.query.status)
    if (req.query.search)  query = query.or(`tracking_number.ilike.%${req.query.search}%,recipient_name.ilike.%${req.query.search}%`)
    const { data: bookings, count, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ bookings, total: count, page, per_page })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/bookings/bulk-save', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res); if (!user) return
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const org_id = profile?.org_id
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })
    const { bookings } = req.body
    if (!Array.isArray(bookings) || !bookings.length) return res.status(400).json({ error: 'bookings array is required' })
    const rows = bookings.map(b => ({
      org_id, store_id: b.store_id || null, tracking_number: b.tracking_number || null,
      courier_slug: b.courier_slug || 'postex', order_ref: b.order_ref || null,
      recipient_name: b.recipient_name || null, recipient_phone: b.recipient_phone || null,
      recipient_city: b.recipient_city || null, recipient_address: b.recipient_address || null,
      weight: b.weight || null, cod_amount: b.cod_amount || 0, pieces: b.pieces || 1,
      status: b.status || 'pending', booking_date: new Date().toISOString(), postex_data: b.postex_data || null,
    }))
    const { data, error } = await supabase.from('courier_bookings').insert(rows).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, saved: data.length, bookings: data })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router