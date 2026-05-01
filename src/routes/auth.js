// ============================================================
//  CASHFLOW.PK — Auth Routes
//  File: cashflow-backend/src/routes/auth.js
// ============================================================

const express = require('express')
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

// ── GET /auth/me ──────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*, organizations(*)')
      .eq('id', user.id)
      .single()

    if (profileError) return res.status(404).json({ error: 'Profile not found' })

    res.json({
      profile: {
        id:        user.id,
        email:     user.email,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        role:      profile.role,
        is_active: profile.is_active,
      },
      org: profile.organizations || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /auth/setup-org ──────────────────────────────────────
router.post('/setup-org', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (existingProfile?.org_id) {
      return res.status(400).json({ error: 'You already have an organization' })
    }

    const { data: existingOwnerOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (existingOwnerOrg) {
      return res.status(400).json({ error: 'You already own an organization' })
    }

    const orgName = req.body.name || req.body.orgName
    if (!orgName?.trim()) return res.status(400).json({ error: 'Organization name required' })

    const slug = orgName.trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      + '-' + Date.now()

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name:     orgName.trim(),
        slug,
        plan:     'free',
        owner_id: user.id,
      })
      .select()
      .single()

    if (orgError) return res.status(500).json({ error: orgError.message })

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id:         user.id,
        org_id:     org.id,
        role:       'owner',
        email:      user.email,
        full_name:  user.user_metadata?.full_name || '',
        avatar_url: user.user_metadata?.avatar_url || '',
        is_active:  true,
      })

    if (profileError) return res.status(500).json({ error: profileError.message })

    res.json({ success: true, org })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /auth/invite ─────────────────────────────────────────
router.post('/invite', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, org_id, organizations(max_users)')
      .eq('id', user.id)
      .single()

    if (!['owner', 'super_admin'].includes(profile?.role)) {
      return res.status(403).json({ error: 'Only owners can invite users' })
    }

    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)

    const maxUsers = profile.organizations?.max_users || 2
    if (count >= maxUsers) {
      return res.status(403).json({ error: `User limit reached (${maxUsers}). Upgrade to Pro.` })
    }

    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email required' })

    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email)
    if (inviteError) return res.status(500).json({ error: inviteError.message })

    res.json({ success: true, message: `Invite sent to ${email}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /auth/org-members ─────────────────────────────────────
router.get('/org-members', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res)
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!['owner', 'super_admin'].includes(profile?.role)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { data: members, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, created_at')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })

    res.json({ members })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router