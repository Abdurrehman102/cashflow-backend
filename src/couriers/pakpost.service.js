// ============================================================
//  CASHFLOW.PK — Pakistan Post Backend Service
//  File: cashflow-backend/src/couriers/pakpost.service.js
// ============================================================

const BASE_URL = 'https://pakpost.gov.pk/api/v1'

async function getFetch() {
  return (await import('node-fetch')).default
}

async function verify(username, password) {
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.token || result.access_token || result.status === 'success')
      return { connected: true, message: 'Pakistan Post connected successfully' }
    return { connected: false, error: 'Invalid username or password' }
  } catch (err) {
    return { connected: false, error: 'Could not reach Pakistan Post servers: ' + err.message }
  }
}

async function createOrder(params) {
  const {
    username, password,
    receiverName, receiverAddress, receiverCity,
    weight, orderRefNumber,
  } = params
  const fetch = await getFetch()
  try {
    // Get auth token first
    const authRes = await fetch(`${BASE_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const auth  = await authRes.json().catch(() => ({}))
    const token = auth.token || auth.access_token
    if (!token) return { success: false, error: 'Authentication failed' }

    const res = await fetch(`${BASE_URL}/shipment/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        receiver_name:    receiverName,
        receiver_address: receiverAddress,
        receiver_city:    receiverCity,
        weight:           weight || 0.5,
        reference_no:     orderRefNumber || `CF-${Date.now()}`,
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.tracking_number || result.status === 'success')
      return { success: true, trackingNumber: result.tracking_number, data: result }
    return { success: false, error: result.message || 'Booking failed' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function trackOrder(username, password, trackingNumber) {
  const fetch = await getFetch()
  try {
    const authRes = await fetch(`${BASE_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const auth  = await authRes.json().catch(() => ({}))
    const token = auth.token || auth.access_token
    if (!token) return { error: 'Authentication failed' }

    const res = await fetch(`${BASE_URL}/shipment/track/${encodeURIComponent(trackingNumber)}`, {
      method:  'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await res.json().catch(() => ({}))
    if (result.tracking_number || result.status === 'success')
      return { tracking: result }
    return { error: 'Tracking failed' }
  } catch {
    return { error: 'Tracking failed' }
  }
}

module.exports = { verify, createOrder, trackOrder }