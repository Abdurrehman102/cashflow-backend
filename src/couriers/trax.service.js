// ============================================================
//  CASHFLOW.PK — Trax Backend Service
//  File: cashflow-backend/src/couriers/trax.service.js
// ============================================================

const BASE_URL = 'https://sonic.pk/api'

async function getFetch() {
  return (await import('node-fetch')).default
}

async function verify(apiKey) {
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/get_cities`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: apiKey }),
    })
    const result = await res.json().catch(() => ({}))
    if (Array.isArray(result) || result.status === 'SUCCESS')
      return { connected: true, message: 'Trax connected successfully' }
    return { connected: false, error: 'Invalid API Key' }
  } catch (err) {
    return { connected: false, error: 'Could not reach Trax servers: ' + err.message }
  }
}

async function createOrder(params) {
  const {
    apiKey,
    toName, toPhone, toAddress, toCity,
    codAmount, weight, pieces, orderRefNumber, orderDetail,
    fromName, fromPhone, fromAddress, fromCity,
  } = params
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/book_order`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token:         apiKey,
        to_name:       toName,
        to_phone:      toPhone,
        to_address:    toAddress,
        to_city:       toCity,
        cod:           codAmount    || 0,
        weight:        weight       || 0.5,
        pieces:        pieces       || 1,
        notes:         orderDetail  || '',
        reference_no:  orderRefNumber || `CF-${Date.now()}`,
        from_name:     fromName     || 'CashFlow Merchant',
        from_phone:    fromPhone    || '',
        from_address:  fromAddress  || '',
        from_city:     fromCity     || '',
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.status === 'SUCCESS' && result.reference_no)
      return { success: true, trackingNumber: result.reference_no, data: result }
    return { success: false, error: result.message || 'Booking failed' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function trackOrder(apiKey, trackingNumber) {
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/get_order_status`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: apiKey, reference_no: trackingNumber }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.status === 'SUCCESS' || result.reference_no)
      return { tracking: result }
    return { error: 'Tracking failed' }
  } catch {
    return { error: 'Tracking failed' }
  }
}

module.exports = { verify, createOrder, trackOrder }