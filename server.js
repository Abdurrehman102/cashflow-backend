const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://cashflow-pk.vercel.app',
    'https://cashflow.pk',
    'https://www.cashflow.pk',
  ],
  credentials: true,
}))
app.use(express.json())

// ── Routes ────────────────────────────────────────────────────
const authRoutes      = require('./src/routes/auth')
const storesRouter    = require('./src/routes/stores')
const couriersRouter  = require('./src/routes/couriers')
const inventoryRouter = require('./src/routes/inventory')

app.use('/auth',      authRoutes)
app.use('/stores',    storesRouter)
app.use('/couriers',  couriersRouter)
app.use('/',          inventoryRouter)   // /stores/:storeId/products + /stores/:storeId/sync-products

app.get('/', (req, res) => {
  res.json({ message: 'CashFlow.pk API Running ✅' })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})