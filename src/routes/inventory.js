// ============================================================
//  CASHFLOW.PK — Inventory Routes
//  File: cashflow-backend/src/routes/inventory.js
// ============================================================

const express  = require('express')
const supabase = require('../supabase')
const router   = express.Router()

// ── Helper: get user + org ────────────────────────────────────
async function getUserAndOrg(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) { res.status(401).json({ error: 'No token' }); return null }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      const base64Payload = token.split('.')[1]
      if (!base64Payload) { res.status(401).json({ error: 'Invalid token' }); return null }
      const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'))
      const now = Math.floor(Date.now() / 1000)
      if (payload.exp && payload.exp < now) { res.status(401).json({ error: 'Token expired' }); return null }
      const { data: userData } = await supabase.auth.admin.getUserById(payload.sub)
      if (!userData?.user) { res.status(401).json({ error: 'Invalid token' }); return null }
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', userData.user.id).single()
      return { user: userData.user, org_id: profile?.org_id }
    }
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    return { user, org_id: profile?.org_id }
  } catch { res.status(401).json({ error: 'Invalid token' }); return null }
}

// ── WooCommerce product normalizer ────────────────────────────
function normalizeProduct(p, org_id, store_id) {
  return {
    org_id,
    store_id,
    external_id:        String(p.id),
    parent_id:          p.parent_id ? String(p.parent_id) : null,
    product_type:       p.type        || 'simple',
    sku:                p.sku         || '',
    name:               p.name        || '',
    slug:               p.slug        || '',
    description:        p.description || '',
    short_description:  p.short_description || '',
    status:             p.status      || 'publish',
    image_url:          p.images?.[0]?.src || null,
    images:             (p.images || []).map(i => ({ id: i.id, src: i.src, alt: i.alt })),
    regular_price:      parseFloat(p.regular_price) || 0,
    sale_price:         parseFloat(p.sale_price)    || 0,
    price:              parseFloat(p.price)          || 0,
    cost_price:         0, // user manually sets this
    stock_status:       p.stock_status    || 'instock',
    stock_quantity:     p.stock_quantity  || 0,
    manage_stock:       p.manage_stock    || false,
    low_stock_amount:   p.low_stock_amount || null,
    weight:             parseFloat(p.weight) || null,
    dimensions:         p.dimensions || null,
    attributes:         p.attributes || [],
    variations:         [], // fetched separately for variable products
    default_attributes: p.default_attributes || [],
    categories:         (p.categories || []).map(c => ({ id: c.id, name: c.name, slug: c.slug })),
    tags:               (p.tags || []).map(t => ({ id: t.id, name: t.name, slug: t.slug })),
    raw_data:           p,
    synced_at:          new Date().toISOString(),
  }
}

// ── GET /stores/:storeId/products ─────────────────────────────
// List products from DB with filters + pagination
router.get('/stores/:storeId/products', async (req, res) => {
  try {
    const auth = await getUserAndOrg(req, res)
    if (!auth) return
    const { org_id } = auth
    const { storeId } = req.params

    const page         = parseInt(req.query.page)      || 1
    const per_page     = parseInt(req.query.per_page)  || 25
    const status       = req.query.status              || 'all'
    const stock_status = req.query.stock_status
    const type         = req.query.type
    const search       = req.query.search
    const category     = req.query.category

    const from = (page - 1) * per_page
    const to   = from + per_page - 1

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('org_id', org_id)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status !== 'all')  query = query.eq('status', status)
    if (stock_status)      query = query.eq('stock_status', stock_status)
    if (type)              query = query.eq('product_type', type)
    if (search)            query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)

    const { data: products, count, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    return res.json({ products: products || [], total: count || 0, page, per_page })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /stores/:storeId/sync-products ──────────────────────
// Sync products from WooCommerce to Supabase
router.post('/stores/:storeId/sync-products', async (req, res) => {
  try {
    const auth = await getUserAndOrg(req, res)
    if (!auth) return
    const { org_id } = auth
    const { storeId } = req.params

    // Get store credentials
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .eq('org_id', org_id)
      .single()

    if (storeErr || !store) return res.status(404).json({ error: 'Store not found' })
    if (store.platform !== 'woocommerce') {
      return res.status(400).json({ error: 'Only WooCommerce supported currently' })
    }

    const { store_url, consumer_key, consumer_secret } = store
    if (!store_url || !consumer_key || !consumer_secret) {
      return res.status(400).json({ error: 'Store credentials incomplete' })
    }

    const fetch      = (await import('node-fetch')).default
    const https      = require('https')
    const agent      = new https.Agent({ rejectUnauthorized: false })
    const baseUrl    = store_url.replace(/\/$/, '')
    const authHeader = 'Basic ' + Buffer.from(`${consumer_key}:${consumer_secret}`).toString('base64')

    let page       = parseInt(req.query.page) || 1
    const per_page = 50
    let synced     = 0

    // Fetch one page of products from WooCommerce
    const wooUrl = `${baseUrl}/wp-json/wc/v3/products?per_page=${per_page}&page=${page}&status=any`
    const wooRes = await fetch(wooUrl, { headers: { Authorization: authHeader }, agent })

    if (!wooRes.ok) {
      const txt = await wooRes.text()
      return res.status(400).json({ error: `WooCommerce error: ${wooRes.status} — ${txt.slice(0, 200)}` })
    }

    const products = await wooRes.json()
    const totalPages = parseInt(wooRes.headers.get('x-wp-totalpages') || '1')

    if (!Array.isArray(products) || products.length === 0) {
      return res.json({ synced: 0, page, totalPages, hasMore: false })
    }

    // For variable products — fetch their variations
    const variableProducts = products.filter(p => p.type === 'variable')
    const variationsMap    = {}

    await Promise.all(variableProducts.map(async (p) => {
      try {
        const varRes  = await fetch(`${baseUrl}/wp-json/wc/v3/products/${p.id}/variations?per_page=100`, { headers: { Authorization: authHeader }, agent })
        const varData = await varRes.json()
        variationsMap[p.id] = (varData || []).map(v => ({
          id:             v.id,
          sku:            v.sku,
          status:         v.status,
          image_url:      v.image?.src || null,
          regular_price:  parseFloat(v.regular_price) || 0,
          sale_price:     parseFloat(v.sale_price)    || 0,
          price:          parseFloat(v.price)          || 0,
          stock_status:   v.stock_status,
          stock_quantity: v.stock_quantity || 0,
          manage_stock:   v.manage_stock   || false,
          weight:         parseFloat(v.weight) || null,
          attributes:     v.attributes || [],
        }))
      } catch { variationsMap[p.id] = [] }
    }))

    // Upsert into Supabase
    const rows = products.map(p => {
      const row = normalizeProduct(p, org_id, storeId)
      if (p.type === 'variable' && variationsMap[p.id]) {
        row.variations = variationsMap[p.id]
      }
      return row
    })

    const { error: upsertErr } = await supabase
      .from('products')
      .upsert(rows, { onConflict: 'org_id,store_id,external_id', ignoreDuplicates: false })

    if (upsertErr) return res.status(500).json({ error: upsertErr.message })

    synced = rows.length

    return res.json({
      synced,
      page,
      totalPages,
      hasMore: page < totalPages,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /stores/:storeId/products/:productId/cost ───────────
// Update cost price (only field user manually sets)
router.patch('/stores/:storeId/products/:productId/cost', async (req, res) => {
  try {
    const auth = await getUserAndOrg(req, res)
    if (!auth) return
    const { org_id } = auth
    const { storeId, productId } = req.params
    const { cost_price } = req.body

    const { data, error } = await supabase
      .from('products')
      .update({ cost_price: parseFloat(cost_price) || 0, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('org_id', org_id)
      .eq('store_id', storeId)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, product: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router