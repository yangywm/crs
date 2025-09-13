import { Hono } from 'hono'
import { apiKeyMiddleware } from '../middleware/auth.js'

const app = new Hono()

// 应用API Key中间件
app.use('*', apiKeyMiddleware)

/**
 * API健康检查
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

/**
 * 获取API Key信息
 */
app.get('/key/info', async (c) => {
  const apiKey = c.get('apiKey')
  const user = c.get('user')
  
  return c.json({
    id: apiKey.id,
    name: apiKey.name,
    status: apiKey.status,
    limits: apiKey.limits,
    client_restrictions: apiKey.client_restrictions,
    user: user ? {
      id: user.id,
      username: user.username,
      role: user.role
    } : null,
    created_at: apiKey.created_at
  })
})

/**
 * 获取使用统计
 */
app.get('/usage/stats', async (c) => {
  try {
    const apiKey = c.get('apiKey')
    const db = c.get('db')
    
    const query = c.req.query()
    const startDate = query.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = query.end_date || new Date().toISOString()
    
    const stats = await db.getUsageStats({
      api_key_id: apiKey.id,
      start_date: startDate,
      end_date: endDate,
      limit: parseInt(query.limit) || 100
    })
    
    // 计算汇总统计
    const summary = {
      total_requests: stats.length,
      total_input_tokens: stats.reduce((sum, s) => sum + (s.input_tokens || 0), 0),
      total_output_tokens: stats.reduce((sum, s) => sum + (s.output_tokens || 0), 0),
      total_cost: stats.reduce((sum, s) => sum + (s.cost || 0), 0),
      models: {}
    }
    
    // 按模型统计
    stats.forEach(stat => {
      if (!summary.models[stat.model]) {
        summary.models[stat.model] = {
          requests: 0,
          input_tokens: 0,
          output_tokens: 0,
          cost: 0
        }
      }
      
      summary.models[stat.model].requests++
      summary.models[stat.model].input_tokens += stat.input_tokens || 0
      summary.models[stat.model].output_tokens += stat.output_tokens || 0
      summary.models[stat.model].cost += stat.cost || 0
    })
    
    return c.json({
      summary,
      details: stats,
      period: {
        start_date: startDate,
        end_date: endDate
      }
    })
    
  } catch (error) {
    console.error('Error getting usage stats:', error)
    return c.json({ error: 'Failed to get usage stats' }, 500)
  }
})

/**
 * 获取可用模型列表
 */
app.get('/models', async (c) => {
  const models = [
    {
      id: 'claude-3-opus-20240229',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic',
      pricing: {
        input: 15,
        output: 75
      }
    },
    {
      id: 'claude-3-sonnet-20240229',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic',
      pricing: {
        input: 3,
        output: 15
      }
    },
    {
      id: 'claude-3-haiku-20240307',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic',
      pricing: {
        input: 0.25,
        output: 1.25
      }
    },
    {
      id: 'claude-sonnet-4-20250514',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic',
      pricing: {
        input: 3,
        output: 15
      }
    },
    {
      id: 'claude-opus-4-20250514',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic',
      pricing: {
        input: 15,
        output: 75
      }
    }
  ]
  
  return c.json({
    object: 'list',
    data: models
  })
})

/**
 * 获取账户状态
 */
app.get('/accounts/status', async (c) => {
  try {
    const db = c.get('db')
    const cache = c.get('cache')
    
    // 尝试从缓存获取
    let accountsStatus = await cache.get('accounts_status')
    
    if (!accountsStatus) {
      // 缓存未命中，从数据库获取
      const claudeAccounts = await db.getClaudeAccounts({ status: 'active' })
      
      accountsStatus = {
        claude: {
          total: claudeAccounts.length,
          active: claudeAccounts.filter(a => a.status === 'active').length,
          last_check: new Date().toISOString()
        }
      }
      
      // 缓存5分钟
      await cache.set('accounts_status', accountsStatus, 300)
    }
    
    return c.json(accountsStatus)
    
  } catch (error) {
    console.error('Error getting accounts status:', error)
    return c.json({ error: 'Failed to get accounts status' }, 500)
  }
})

/**
 * 测试API连接
 */
app.post('/test', async (c) => {
  try {
    const { message = 'Hello, this is a test message.' } = await c.req.json()
    
    // 构建测试请求
    const testRequest = {
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: message
        }
      ]
    }
    
    // 发送到Claude API路由
    const response = await fetch(`${c.req.url.replace('/api/test', '/claude/v1/messages')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': c.req.header('X-API-Key')
      },
      body: JSON.stringify(testRequest)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      return c.json({
        success: false,
        error: 'API test failed',
        details: errorText
      }, response.status)
    }
    
    const result = await response.json()
    
    return c.json({
      success: true,
      message: 'API test successful',
      response: result,
      test_request: testRequest
    })
    
  } catch (error) {
    console.error('API test error:', error)
    return c.json({
      success: false,
      error: 'API test failed',
      message: error.message
    }, 500)
  }
})

export default app