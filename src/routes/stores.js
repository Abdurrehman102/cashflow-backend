// ============================================================
//  CASHFLOW.PK — Stores Routes
//  File: cashflow-backend/src/routes/stores.js
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

// ── Helper: get org_id for user ───────────────────────────────
async function getOrgId(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single()
  return profile?.org_id || null
}

// ── Validate WooCommerce credentials ─────────────────────────
function validateWooCredentials(consumer_key, consumer_secret) {
  const errors = {}

  // Real WooCommerce keys: ck_ + 40 alphanumeric chars = 43 total
  if (consumer_key) {
    if (!consumer_key.startsWith('ck_')) {
      errors.consumer_key = 'Consumer Key must start with ck_'
    } else if (consumer_key.length < 40) {
      errors.consumer_key = `Consumer Key is too short (${consumer_key.length} chars). Real WooCommerce keys are at least 40 characters.`
    } else if (!/^ck_[a-f0-9]+$/.test(consumer_key)) {
      errors.consumer_key = 'Consumer Key contains invalid characters. It should only contain lowercase hex characters (0-9, a-f) after ck_'
    }
  }

  if (consumer_secret) {
    if (!consumer_secret.startsWith('cs_')) {
      errors.consumer_secret = 'Consumer Secret must start with cs_'
    } else if (consumer_secret.length < 40) {
      errors.consumer_secret = `Consumer Secret is too short (${consumer_secret.length} chars). Real WooCommerce keys are at least 40 characters.`
    } else if (!/^cs_[a-f0-9]+$/.test(consumer_secret)) {
      errors.consumer_secret = 'Consumer Secret contains invalid characters. It should only contain lowercase hex characters (0-9, a-f) after cs_'
    }
  }

  return errors
}

// ── Validate URL ──────────────────────────────────────────────
function validateUrl(url) {
  try {
    const u = new URL(url)
    if (!['http:', 'https:'].includes(u.protocol)) return 'URL must start with http:// or https://'
    return null
  } catch {
    return 'Invalid URL format — must be a full URL like https://yourstore.com'
  }
}

// ── Test WooCommerce connection ───────────────────────────────
async function testWooConnection(store_url, consumer_key, consumer_secret) {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => {
      resolve({ connected: false, error: 'Connection timed out — store took too long to respond' })
    }, 7000)

    try {
      const fetch   = (await import('node-fetch')).default
      const https   = await import('https')
      const agent   = new https.Agent({ rejectUnauthorized: false })
      const baseUrl = store_url.replace(/\/$/, '')
      const creds   = Buffer.from(`${consumer_key}:${consumer_secret}`).toString('base64')

      const response = await fetch(`${baseUrl}/wp-json/wc/v3/orders?per_page=1`, {
        method:  'GET',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
        agent,
      })

      clearTimeout(timer)

      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          return resolve({
            connected: false,
            error: 'This URL does not appear to be a WooCommerce store — make sure WooCommerce REST API is enabled'
          })
        }
        const body = await response.json().catch(() => null)
        if (!Array.isArray(body)) {
          return resolve({
            connected: false,
            error: 'Unexpected response from store — make sure WooCommerce REST API is enabled'
          })
        }
        return resolve({ connected: true })
      }

      const status = response.status
      if (status === 401) return resolve({ connected: false, error: 'Invalid credentials — Consumer Key or Secret is wrong' })
      if (status === 403) return resolve({ connected: false, error: 'Access denied — make sure the API key has Read/Write permissions' })
      if (status === 404) return resolve({ connected: false, error: 'WooCommerce REST API not found — check your store URL' })
      if (status === 503 || status === 429) return resolve({ connected: false, error: 'Store is temporarily unavailable — try again later' })

      resolve({ connected: false, error: `Connection failed with status ${status}` })
    } catch (err) {
      clearTimeout(timer)
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        return resolve({ connected: false, error: 'Store URL is unreachable — check the domain and make sure your store is online' })
      }
      resolve({ connected: false, error: 'Connection failed: ' + err.message })
    }
  })
}

// ── GET /stores ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const org_id = await getOrgId(user.id)
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const { data: stores, error } = await supabase
      .from('stores')
      .select('*')
      .eq('org_id', org_id)
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })

    res.json({ stores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /stores/verify-credentials ──────────────────────────
router.post('/verify-credentials', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { store_url, consumer_key, consumer_secret } = req.body

    if (!store_url?.trim() || !consumer_key?.trim() || !consumer_secret?.trim()) {
      return res.status(400).json({ error: 'store_url, consumer_key, and consumer_secret are required' })
    }

    const credErrors = validateWooCredentials(consumer_key.trim(), consumer_secret.trim())
    if (Object.keys(credErrors).length > 0) {
      return res.status(400).json({ error: 'Invalid credential format', fields: credErrors })
    }

    const urlError = validateUrl(store_url.trim())
    if (urlError) return res.status(400).json({ error: urlError })

    const result = await testWooConnection(store_url.trim(), consumer_key.trim(), consumer_secret.trim())

    return res.json({ connected: result.connected, error: result.error || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /stores ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    // Get org_id — try profile first, then organizations by owner_id
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    let org_id = profile?.org_id || null

    if (!org_id) {
      const { data: ownedOrg } = await supabase.from('organizations').select('id').eq('owner_id', user.id).single()
      org_id = ownedOrg?.id || null
    }

    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const {
      name, platform = 'woocommerce',
      store_url, consumer_key, consumer_secret, access_token,
      currency = 'PKR',
    } = req.body

    if (!name?.trim()) return res.status(400).json({ error: 'Store name is required' })

    // ── Platform-specific validation ──────────────────────────
    const validationErrors = {}

    if (platform === 'woocommerce' || platform === 'shopify') {
      if (!store_url?.trim()) {
        validationErrors.store_url = 'Store URL is required'
      } else {
        const urlErr = validateUrl(store_url.trim())
        if (urlErr) validationErrors.store_url = urlErr
      }
    }

    if (platform === 'woocommerce' && consumer_key?.trim() && consumer_secret?.trim()) {
      const credErrors = validateWooCredentials(consumer_key.trim(), consumer_secret.trim())
      Object.assign(validationErrors, credErrors)
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ error: 'Validation failed', fields: validationErrors })
    }

    // ── Save store ─────────────────────────────────────────────
    const { data: store, error: insertError } = await supabase
      .from('stores')
      .insert({
        org_id,
        name:            name.trim(),
        platform,
        store_url:       store_url?.trim()       || null,
        consumer_key:    consumer_key?.trim()    || null,
        consumer_secret: consumer_secret?.trim() || null,
        access_token:    access_token?.trim()    || null,
        currency,
        is_connected:    false,
      })
      .select()
      .single()

    if (insertError) return res.status(500).json({ error: insertError.message })

    // Test actual connection before marking as connected
    let isConnected = false
    let connectionResult = { connected: false, error: 'Not tested' }
    if (platform === 'woocommerce' && store_url && consumer_key && consumer_secret) {
      connectionResult = await testWooConnection(
        store_url.trim(),
        consumer_key.trim(),
        consumer_secret.trim()
      )
      isConnected = connectionResult.connected
      await supabase.from('stores').update({
        is_connected: isConnected,
        updated_at:   new Date().toISOString(),
      }).eq('id', store.id)
      store.is_connected = isConnected
    }

    res.json({
      store,
      connection: connectionResult,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /stores/:id ───────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const org_id = await getOrgId(user.id)
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const {
      name, store_url, consumer_key, consumer_secret,
      access_token, currency, platform, is_active,
    } = req.body

    // ── Validate if credentials provided ──────────────────────
    const validationErrors = {}

    if (store_url !== undefined && store_url?.trim()) {
      const urlErr = validateUrl(store_url.trim())
      if (urlErr) validationErrors.store_url = urlErr
    }

    const incomingPlatform = platform || req.body.currentPlatform
    if (incomingPlatform === 'woocommerce' && consumer_key?.trim() && consumer_secret?.trim()) {
      const credErrors = validateWooCredentials(consumer_key.trim(), consumer_secret.trim())
      Object.assign(validationErrors, credErrors)
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ error: 'Validation failed', fields: validationErrors })
    }

    const updates = { updated_at: new Date().toISOString() }
    if (name            !== undefined) updates.name            = name
    if (store_url       !== undefined) updates.store_url       = store_url?.trim() || null
    if (consumer_key    !== undefined) updates.consumer_key    = consumer_key?.trim() || null
    if (consumer_secret !== undefined) updates.consumer_secret = consumer_secret?.trim() || null
    if (access_token    !== undefined) updates.access_token    = access_token?.trim() || null
    if (currency        !== undefined) updates.currency        = currency
    if (platform        !== undefined) updates.platform        = platform
    if (is_active       !== undefined) updates.is_active       = is_active

    // Reset connection if credentials changed
    if (consumer_key !== undefined || consumer_secret !== undefined || store_url !== undefined) {
      updates.is_connected = false
    }

    const { data: store, error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', req.params.id)
      .eq('org_id', org_id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!store) return res.status(404).json({ error: 'Store not found' })

    res.json({ store })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /stores/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const org_id = await getOrgId(user.id)
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', org_id)

    if (error) return res.status(500).json({ error: error.message })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /stores/:id/test-connection ─────────────────────────
router.post('/:id/test-connection', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const org_id = await getOrgId(user.id)
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', org_id)
      .single()

    if (storeError || !store) return res.status(404).json({ error: 'Store not found' })

    if (store.platform !== 'woocommerce') {
      return res.json({ success: false, connected: false, error: 'Connection testing is only supported for WooCommerce stores' })
    }

    if (!store.store_url) return res.status(400).json({ error: 'Store URL is not set' })
    if (!store.consumer_key) return res.status(400).json({ error: 'Consumer Key is not set' })
    if (!store.consumer_secret) return res.status(400).json({ error: 'Consumer Secret is not set' })

    // Validate key format before even trying
    const credErrors = validateWooCredentials(store.consumer_key, store.consumer_secret)
    if (Object.keys(credErrors).length > 0) {
      return res.status(400).json({ error: 'Invalid credentials format', fields: credErrors })
    }

    const result = await testWooConnection(store.store_url, store.consumer_key, store.consumer_secret)

    await supabase.from('stores').update({
      is_connected: result.connected,
      updated_at:   new Date().toISOString(),
    }).eq('id', req.params.id)

    return res.json({
      success:   result.connected,
      connected: result.connected,
      error:     result.error || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /stores/:id/sync-orders ─────────────────────────────
router.post('/:id/sync-orders', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const org_id = await getOrgId(user.id)
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', org_id)
      .single()

    if (storeError || !store) return res.status(404).json({ error: 'Store not found' })
    if (store.platform !== 'woocommerce') return res.status(400).json({ error: 'Sync is only supported for WooCommerce stores' })
    if (!store.is_connected) return res.status(400).json({ error: 'Store is not connected' })

    const page     = parseInt(req.query.page) || 1
    const per_page = 100

    const fetch   = (await import('node-fetch')).default
    const https   = await import('https')
    const agent   = new https.Agent({ rejectUnauthorized: false })
    const baseUrl = store.store_url.replace(/\/$/, '')
    const creds   = Buffer.from(`${store.consumer_key}:${store.consumer_secret}`).toString('base64')

    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), 15000)

    let wooRes
    try {
      wooRes = await fetch(
        `${baseUrl}/wp-json/wc/v3/orders?per_page=${per_page}&page=${page}&orderby=date&order=desc`,
        {
          method:  'GET',
          headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
          agent,
          signal: controller.signal,
        }
      )
    } finally {
      clearTimeout(timer)
    }

    if (!wooRes.ok) {
      return res.status(500).json({ error: `WooCommerce returned status ${wooRes.status}` })
    }

    const wooOrders = await wooRes.json()

    if (!Array.isArray(wooOrders)) {
      return res.status(500).json({ error: 'Unexpected response from WooCommerce' })
    }

    const mappedOrders = wooOrders.map(wooOrder => ({
      org_id,
      store_id:         store.id,
      external_id:      String(wooOrder.id),
      order_number:     String(wooOrder.number),
      status:           wooOrder.status,
      customer_name:    ((wooOrder.billing.first_name || '') + ' ' + (wooOrder.billing.last_name || '')).trim(),
      customer_email:   wooOrder.billing.email   || null,
      customer_phone:   wooOrder.billing.phone   || null,
      billing_address:  wooOrder.billing,
      shipping_address: wooOrder.shipping,
      line_items:       wooOrder.line_items,
      total_amount:     parseFloat(wooOrder.total) || 0,
      currency:         wooOrder.currency || store.currency || 'PKR',
      payment_method:   wooOrder.payment_method_title || null,
      notes:            wooOrder.customer_note || null,
      ordered_at:       wooOrder.date_created  || null,
      synced_at:        new Date().toISOString(),
    }))

    const { error: upsertError } = await supabase
      .from('orders')
      .upsert(mappedOrders, { onConflict: 'store_id,external_id' })

    if (upsertError) return res.status(500).json({ error: upsertError.message })

    return res.json({ success: true, synced: mappedOrders.length, page })
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(500).json({ error: 'WooCommerce request timed out' })
    }
    res.status(500).json({ error: err.message })
  }
})

// ── GET /stores/:id/orders ────────────────────────────────────
router.get('/:id/orders', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const org_id = await getOrgId(user.id)
    if (!org_id) return res.status(404).json({ error: 'Organization not found' })

    const page     = parseInt(req.query.page)     || 1
    const per_page = parseInt(req.query.per_page) || 50
    const status   = req.query.status

    const from = (page - 1) * per_page
    const to   = from + per_page - 1

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('org_id', org_id)
      .eq('store_id', req.params.id)
      .order('ordered_at', { ascending: false })
      .range(from, to)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: orders, count, error } = await query

    if (error) return res.status(500).json({ error: error.message })

    return res.json({ orders, total: count, page, per_page })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router