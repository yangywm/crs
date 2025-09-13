import { Hono } from 'hono'
import { authMiddleware, adminMiddleware, generateApiKey, hashApiKey } from '../middleware/auth.js'
import bcrypt from 'bcryptjs'

const app = new Hono()

// 应用认证中间件
app.use('*', authMiddleware)
app.use('*', adminMiddleware)

/**
 * 获取系统概览
 */
app.get('/overview', async (c) => {
  try {
    const db = c.get('db')
    
    // 获取统计数据
    const [accounts, apiKeys, users] = await Promise.all([
      db.getClaudeAccounts(),
      db.getApiKeys(),
      db.getUsers ? db.getUsers() : []
    ])
    
    // 获取今日使用统计
    const today = new Date().toISOString().split('T')[0]
    const todayUsage = await db.getUsageStats({
      start_date: `${today}T00:00:00.000Z`,
      end_date: `${today}T23:59:59.999Z`
    })
    
    const overview = {
      accounts: {
        total: accounts.length,
        active: accounts.filter(a => a.status === 'active').length,
        inactive: accounts.filter(a => a.status !== 'active').length
      },
      apiKeys: {
        total: apiKeys.length,
        active: apiKeys.filter(k => k.status === 'active').length,
        inactive: apiKeys.filter(k => k.status !== 'active').length
      },
      users: {
        total: users.length,
        admins: users.filter(u => u.role === 'admin').length,
        regular: users.filter(u => u.role === 'user').length
      },
      usage: {
        today: {
          requests: todayUsage.length,
          tokens: todayUsage.reduce((sum, u) => sum + (u.input_tokens || 0) + (u.output_tokens || 0), 0),
          cost: todayUsage.reduce((sum, u) => sum + (u.cost || 0), 0)
        }
      }
    }
    
    return c.json(overview)
  } catch (error) {
    console.error('Error getting overview:', error)
    return c.json({ error: 'Failed to get overview' }, 500)
  }
})

/**
 * Claude账户管理
 */

// 获取所有Claude账户
app.get('/accounts', async (c) => {
  try {
    const db = c.get('db')
    const accounts = await db.getClaudeAccounts()
    
    // 隐藏敏感信息
    const safeAccounts = accounts.map(account => ({
      ...account,
      authorization: account.authorization ? '***' : null
    }))
    
    return c.json(safeAccounts)
  } catch (error) {
    console.error('Error getting accounts:', error)
    return c.json({ error: 'Failed to get accounts' }, 500)
  }
})

// 创建Claude账户
app.post('/accounts', async (c) => {
  try {
    const db = c.get('db')
    const accountData = await c.req.json()
    
    // 验证必需字段
    if (!accountData.name || !accountData.authorization) {
      return c.json({ error: 'Name and authorization are required' }, 400)
    }
    
    const account = await db.createClaudeAccount(accountData)
    
    // 返回时隐藏敏感信息
    return c.json({
      ...account,
      authorization: '***'
    })
  } catch (error) {
    console.error('Error creating account:', error)
    return c.json({ error: 'Failed to create account' }, 500)
  }
})

// 更新Claude账户
app.put('/accounts/:id', async (c) => {
  try {
    const db = c.get('db')
    const accountId = c.req.param('id')
    const updates = await c.req.json()
    
    const account = await db.updateClaudeAccount(accountId, updates)
    if (!account) {
      return c.json({ error: 'Account not found' }, 404)
    }
    
    return c.json({
      ...account,
      authorization: account.authorization ? '***' : null
    })
  } catch (error) {
    console.error('Error updating account:', error)
    return c.json({ error: 'Failed to update account' }, 500)
  }
})

// 删除Claude账户
app.delete('/accounts/:id', async (c) => {
  try {
    const db = c.get('db')
    const accountId = c.req.param('id')
    
    await db.updateClaudeAccount(accountId, { status: 'deleted' })
    
    return c.json({ message: 'Account deleted successfully' })
  } catch (error) {
    console.error('Error deleting account:', error)
    return c.json({ error: 'Failed to delete account' }, 500)
  }
})

/**
 * API Key管理
 */

// 获取所有API Keys
app.get('/api-keys', async (c) => {
  try {
    const db = c.get('db')
    const apiKeys = await db.getApiKeys()
    
    // 隐藏敏感信息
    const safeApiKeys = apiKeys.map(key => ({
      ...key,
      key_hash: undefined,
      key: key.key ? `${key.key.substring(0, 8)}...` : null
    }))
    
    return c.json(safeApiKeys)
  } catch (error) {
    console.error('Error getting API keys:', error)
    return c.json({ error: 'Failed to get API keys' }, 500)
  }
})

// 创建API Key
app.post('/api-keys', async (c) => {
  try {
    const db = c.get('db')
    const keyData = await c.req.json()
    
    // 验证必需字段
    if (!keyData.name) {
      return c.json({ error: 'Name is required' }, 400)
    }
    
    // 生成API Key
    const apiKey = generateApiKey(c.env.API_KEY_PREFIX)
    const keyHash = await hashApiKey(apiKey)
    
    const apiKeyRecord = await db.createApiKey({
      ...keyData,
      key: keyHash
    })
    
    // 返回完整的API Key（只有这一次）
    return c.json({
      ...apiKeyRecord,
      key: apiKey, // 完整的key，只返回一次
      key_hash: undefined
    })
  } catch (error) {
    console.error('Error creating API key:', error)
    return c.json({ error: 'Failed to create API key' }, 500)
  }
})

// 更新API Key
app.put('/api-keys/:id', async (c) => {
  try {
    const db = c.get('db')
    const keyId = c.req.param('id')
    const updates = await c.req.json()
    
    // 不允许更新key本身
    delete updates.key
    delete updates.key_hash
    
    const apiKey = await db.updateApiKey(keyId, updates)
    if (!apiKey) {
      return c.json({ error: 'API key not found' }, 404)
    }
    
    return c.json({
      ...apiKey,
      key_hash: undefined,
      key: apiKey.key ? `${apiKey.key.substring(0, 8)}...` : null
    })
  } catch (error) {
    console.error('Error updating API key:', error)
    return c.json({ error: 'Failed to update API key' }, 500)
  }
})

// 删除API Key
app.delete('/api-keys/:id', async (c) => {
  try {
    const db = c.get('db')
    const keyId = c.req.param('id')
    
    await db.updateApiKey(keyId, { status: 'deleted' })
    
    return c.json({ message: 'API key deleted successfully' })
  } catch (error) {
    console.error('Error deleting API key:', error)
    return c.json({ error: 'Failed to delete API key' }, 500)
  }
})

/**
 * 使用统计
 */
app.get('/usage-stats', async (c) => {
  try {
    const db = c.get('db')
    const query = c.req.query()
    
    const filters = {
      start_date: query.start_date,
      end_date: query.end_date,
      api_key_id: query.api_key_id,
      user_id: query.user_id,
      limit: parseInt(query.limit) || 100
    }
    
    const stats = await db.getUsageStats(filters)
    
    return c.json(stats)
  } catch (error) {
    console.error('Error getting usage stats:', error)
    return c.json({ error: 'Failed to get usage stats' }, 500)
  }
})

/**
 * 系统设置
 */
app.get('/settings', async (c) => {
  try {
    const db = c.get('db')
    
    const settings = {
      system: await db.getSetting('system') || {},
      security: await db.getSetting('security') || {},
      limits: await db.getSetting('limits') || {}
    }
    
    return c.json(settings)
  } catch (error) {
    console.error('Error getting settings:', error)
    return c.json({ error: 'Failed to get settings' }, 500)
  }
})

app.put('/settings', async (c) => {
  try {
    const db = c.get('db')
    const settings = await c.req.json()
    
    // 更新各个设置分类
    for (const [category, values] of Object.entries(settings)) {
      await db.setSetting(category, values)
    }
    
    return c.json({ message: 'Settings updated successfully' })
  } catch (error) {
    console.error('Error updating settings:', error)
    return c.json({ error: 'Failed to update settings' }, 500)
  }
})

export default app