// ============================================================
//  CASHFLOW.PK — MNP Backend Service
//  File: cashflow-backend/src/couriers/mnp.service.js
// ============================================================

const BASE_URL = 'https://mnp.com.pk/api/v1'

async function getFetch() {
  return (await import('node-fetch')).default
}

async function verify(apiKey, accountCode) {
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ account_code: accountCode }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.status === 'success' || result.verified === true)
      return { connected: true, message: 'MNP connected successfully' }
    return { connected: false, error: 'Invalid API Key or Account Code' }
  } catch (err) {
    return { connected: false, error: 'Could not reach MNP servers: ' + err.message }
  }
}

async function createOrder(params) {
  const {
    apiKey, accountCode,
    receiverName, receiverPhone, receiverAddress, receiverCity,
    codAmount, weight, orderRefNumber,
  } = params
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/shipment/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        account_code:     accountCode,
        receiver_name:    receiverName,
        receiver_phone:   receiverPhone,
        receiver_address: receiverAddress,
        city:             receiverCity,
        cod_amount:       codAmount || 0,
        weight:           weight    || 0.5,
        order_ref:        orderRefNumber || `CF-${Date.now()}`,
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.status === 'success' && result['order-detail-id'])
      return { success: true, trackingNumber: result['order-detail-id'], data: result }
    return { success: false, error: result.message || 'Booking failed' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function trackOrder(apiKey, trackingNumber) {
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/shipment/track/${encodeURIComponent(trackingNumber)}`, {
      method:  'GET',
      headers: { 'x-api-key': apiKey },
    })
    const result = await res.json().catch(() => ({}))
    if (result.status === 'success' || result['order-detail-id'])
      return { tracking: result }
    return { error: 'Tracking failed' }
  } catch {
    return { error: 'Tracking failed' }
  }
}

module.exports = { verify, createOrder, trackOrder }