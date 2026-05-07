// ============================================================
//  CASHFLOW.PK — PostEx Backend Service
//  File: cashflow-backend/src/couriers/postex.service.js
// ============================================================

const BASE_URL = 'https://api.postex.pk/services/integration/api'

async function getFetch() {
  return (await import('node-fetch')).default
}

async function verify(apiToken) {
  const fetch      = await getFetch()
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${BASE_URL}/order/v2/get-operational-city`, {
      method: 'GET', headers: { token: apiToken.trim() }, signal: controller.signal,
    })
    clearTimeout(timer)
    const result = await res.json().catch(() => ({}))
    if (res.status === 200 && result.statusCode === '200')
      return { connected: true, message: 'PostEx connected successfully' }
    return { connected: false, error: 'Invalid API token — check your PostEx credentials' }
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError')
      return { connected: false, error: 'Could not reach PostEx servers — check your internet connection' }
    return { connected: false, error: 'Could not reach PostEx servers: ' + err.message }
  }
}

async function getCities(apiToken) {
  const fetch = await getFetch()
  try {
    const res    = await fetch(`${BASE_URL}/order/v2/get-operational-city`, { method: 'GET', headers: { token: apiToken.trim() } })
    const result = await res.json().catch(() => ({}))
    if (result.statusCode === '200') return { cities: result.dist || [] }
    return { cities: [], error: result.statusMessage || 'Could not fetch cities' }
  } catch (err) {
    return { cities: [], error: err.message }
  }
}

async function getPickupAddresses(apiToken) {
  const fetch = await getFetch()
  try {
    const res    = await fetch(`${BASE_URL}/order/v1/get-merchant-address`, { method: 'GET', headers: { token: apiToken.trim() } })
    const result = await res.json().catch(() => ({}))
    if (res.ok) return { addresses: result.dist || [] }
    return { addresses: [], error: 'Could not fetch addresses' }
  } catch {
    return { addresses: [], error: 'Could not fetch addresses' }
  }
}

async function createOrder(params) {
  const {
    apiToken, customerName, customerPhone, deliveryAddress,
    cityName, invoicePayment, orderDetail, orderRefNumber,
    orderType, pickupAddressCode,
  } = params
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/order/v3/create-order`, {
      method:  'POST',
      headers: { token: apiToken.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName, customerPhone, deliveryAddress, cityName,
        invoicePayment, orderDetail: orderDetail || '',
        orderRefNumber, orderType: orderType || 'Normal',
        pickupAddressCode: pickupAddressCode || '',
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.statusCode === '200')
      return { success: true, trackingNumber: result.dist?.trackingNumber, data: result.dist }
    return { success: false, error: result.statusMessage || 'Booking failed' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function trackOrder(apiToken, trackingNumber) {
  const fetch = await getFetch()
  try {
    const res    = await fetch(`${BASE_URL}/order/v1/track-order/${encodeURIComponent(trackingNumber)}`, { method: 'GET', headers: { token: apiToken || '' } })
    const result = await res.json().catch(() => ({}))
    if (res.ok) return { tracking: result.dist }
    return { error: 'Tracking failed' }
  } catch {
    return { error: 'Tracking failed' }
  }
}

module.exports = { verify, getCities, getPickupAddresses, createOrder, trackOrder }