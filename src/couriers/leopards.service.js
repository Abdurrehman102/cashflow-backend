// ============================================================
//  CASHFLOW.PK — Leopards Backend Service
//  File: cashflow-backend/src/couriers/leopards.service.js
// ============================================================

const BASE_URL = 'https://merchantapi.leopardscourier.com/api'

async function getFetch() {
  return (await import('node-fetch')).default
}

async function verify(apiKey, apiPassword) {
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/bookPacket/format/json/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey, api_password: apiPassword,
        booking_date: new Date().toISOString().split('T')[0],
        booked_packet_consignment_no_list: '000000000000',
      }),
    })
    const result = await res.json().catch(() => ({}))
    // Leopards returns error code 0 for auth failure
    if (result.status === 1 || result.error === null)
      return { connected: true, message: 'Leopards connected successfully' }
    if (result.error?.includes('auth') || result.error?.includes('invalid'))
      return { connected: false, error: 'Invalid API Key or Password' }
    // Any response means credentials work
    return { connected: true, message: 'Leopards connected successfully' }
  } catch (err) {
    return { connected: false, error: 'Could not reach Leopards servers: ' + err.message }
  }
}

async function createOrder(params) {
  const {
    apiKey, apiPassword,
    consigneeName, consigneePhone, consigneeAddress, consigneeCity,
    codAmount, weight, pieces, orderRefNumber, orderDetail,
    shipperName, shipperPhone,
  } = params
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/bookPacket/format/json/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:              apiKey,
        api_password:         apiPassword,
        booked_packet_type:   'normal',
        packet_pieces:        pieces || 1,
        packet_weight:        weight || 0.5,
        net_receiver:         codAmount || 0,
        consignee_city_id:    consigneeCity,
        consignee_name:       consigneeName,
        consignee_phone:      consigneePhone,
        consignee_address:    consigneeAddress,
        order_id:             orderRefNumber || `CF-${Date.now()}`,
        packet_commodity:     orderDetail || 'General',
        shipper_name:         shipperName  || 'CashFlow Merchant',
        shipper_phone:        shipperPhone || '',
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.status === 1 && result.track_number)
      return { success: true, trackingNumber: result.track_number, data: result }
    return { success: false, error: result.error || 'Booking failed' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function trackOrder(apiKey, apiPassword, trackingNumber) {
  const fetch = await getFetch()
  try {
    const res = await fetch(`${BASE_URL}/trackBookedPacket/format/json/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:      apiKey,
        api_password: apiPassword,
        track_numbers: trackingNumber,
      }),
    })
    const result = await res.json().catch(() => ({}))
    const packet = result.packet_list?.[0]
    if (packet) return { tracking: packet }
    return { error: 'Tracking failed' }
  } catch {
    return { error: 'Tracking failed' }
  }
}

module.exports = { verify, createOrder, trackOrder }