// ============================================================
//  CASHFLOW.PK — TCS Backend Service
//  File: cashflow-backend/src/couriers/tcs.service.js
// ============================================================

const BASE_URL = 'https://connect.tcscourier.com/api'

async function getFetch() {
  return (await import('node-fetch')).default
}

async function verify(username, password, costCenterId) {
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/auth/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.access_token || result.token)
      return { connected: true, message: 'TCS connected successfully', token: result.access_token || result.token }
    return { connected: false, error: 'Invalid username or password' }
  } catch (err) {
    return { connected: false, error: 'Could not reach TCS servers: ' + err.message }
  }
}

async function createOrder(params) {
  const {
    username, password, costCenterId,
    consigneeName, consigneePhone, consigneeAddress, consigneeCity,
    codAmount, weight, pieces, orderRefNumber, serviceType,
  } = params
  const fetch = await getFetch()
  try {
    // Get auth token first
    const authRes = await fetch(`${BASE_URL}/auth/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const auth = await authRes.json().catch(() => ({}))
    const token = auth.access_token || auth.token
    if (!token) return { success: false, error: 'Authentication failed' }

    const res = await fetch(`${BASE_URL}/shipment/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        CostCenterId:     costCenterId,
        ConsigneeName:    consigneeName,
        ConsigneePhone:   consigneePhone,
        ConsigneeAddress: consigneeAddress,
        ConsigneeCity:    consigneeCity,
        CODAmount:        codAmount || 0,
        Weight:           weight    || 0.5,
        Pieces:           pieces    || 1,
        ServiceType:      serviceType || 'overnight',
        ReferenceNo:      orderRefNumber || `CF-${Date.now()}`,
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.ConsignmentNo || result.TrackingNo)
      return { success: true, trackingNumber: result.ConsignmentNo || result.TrackingNo, data: result }
    return { success: false, error: result.Message || result.error || 'Booking failed' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function trackOrder(username, password, trackingNumber) {
  const fetch = await getFetch()
  try {
    const authRes = await fetch(`${BASE_URL}/auth/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const auth  = await authRes.json().catch(() => ({}))
    const token = auth.access_token || auth.token
    if (!token) return { error: 'Authentication failed' }

    const res = await fetch(`${BASE_URL}/shipment/track/${encodeURIComponent(trackingNumber)}`, {
      method:  'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await res.json().catch(() => ({}))
    if (result.ConsignmentNo || result.StatusDescription)
      return { tracking: result }
    return { error: 'Tracking failed' }
  } catch {
    return { error: 'Tracking failed' }
  }
}

module.exports = { verify, createOrder, trackOrder }