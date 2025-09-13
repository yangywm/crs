import { Hono } from 'hono'

const app = new Hono()

/**
 * 接收Webhook通知
 */
app.post('/notify', async (c) => {
  try {
    const payload = await c.req.json()
    const logger = c.get('logger')
    
    // 记录Webhook事件
    logger.info('Webhook notification received', {
      type: payload.type,
      data: payload.data,
      timestamp: payload.timestamp || new Date().toISOString(),
      source: c.req.header('User-Agent')
    })
    
    // 根据事件类型处理
    switch (payload.type) {
      case 'account_error':
        await handleAccountError(c, payload.data)
        break
        
      case 'usage_alert':
        await handleUsageAlert(c, payload.data)
        break
        
      case 'system_status':
        await handleSystemStatus(c, payload.data)
        break
        
      default:
        logger.warn('Unknown webhook event type', { type: payload.type })
    }
    
    return c.json({ success: true, message: 'Webhook processed' })
    
  } catch (error) {
    console.error('Webhook processing error:', error)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

/**
 * 处理账户错误事件
 */
async function handleAccountError(c, data) {
  const { account_id, error_type, error_message } = data
  const db = c.get('db')
  const logger = c.get('logger')
  
  try {
    // 更新账户状态
    await db.updateClaudeAccount(account_id, {
      status: error_type === 'auth_failed' ? 'invalid' : 'inactive',
      error_count: (await db.getClaudeAccountById(account_id))?.error_count + 1 || 1,
      updated_at: new Date().toISOString()
    })
    
    logger.error('Account error processed', {
      account_id,
      error_type,
      error_message
    })
    
  } catch (error) {
    logger.error('Failed to process account error', { error: error.message })
  }
}

/**
 * 处理使用量告警事件
 */
async function handleUsageAlert(c, data) {
  const { api_key_id, usage_type, threshold, current_usage } = data
  const logger = c.get('logger')
  
  logger.warn('Usage alert triggered', {
    api_key_id,
    usage_type,
    threshold,
    current_usage,
    percentage: (current_usage / threshold * 100).toFixed(2)
  })
  
  // 这里可以添加更多告警逻辑，如发送邮件、Slack通知等
}

/**
 * 处理系统状态事件
 */
async function handleSystemStatus(c, data) {
  const { status, message, metrics } = data
  const logger = c.get('logger')
  const cache = c.get('cache')
  
  // 更新系统状态缓存
  await cache.set('system_status', {
    status,
    message,
    metrics,
    updated_at: new Date().toISOString()
  }, 300) // 5分钟缓存
  
  logger.info('System status updated', { status, message, metrics })
}

/**
 * 获取Webhook配置
 */
app.get('/config', async (c) => {
  const db = c.get('db')
  
  try {
    const config = await db.getSetting('webhook') || {
      enabled: true,
      endpoints: [],
      events: ['account_error', 'usage_alert', 'system_status']
    }
    
    return c.json(config)
    
  } catch (error) {
    console.error('Error getting webhook config:', error)
    return c.json({ error: 'Failed to get webhook config' }, 500)
  }
})

/**
 * 更新Webhook配置
 */
app.put('/config', async (c) => {
  const db = c.get('db')
  
  try {
    const config = await c.req.json()
    
    // 验证配置
    if (typeof config.enabled !== 'boolean') {
      return c.json({ error: 'Invalid enabled value' }, 400)
    }
    
    if (!Array.isArray(config.endpoints)) {
      return c.json({ error: 'Invalid endpoints value' }, 400)
    }
    
    if (!Array.isArray(config.events)) {
      return c.json({ error: 'Invalid events value' }, 400)
    }
    
    await db.setSetting('webhook', config)
    
    return c.json({ success: true, message: 'Webhook config updated' })
    
  } catch (error) {
    console.error('Error updating webhook config:', error)
    return c.json({ error: 'Failed to update webhook config' }, 500)
  }
})

/**
 * 测试Webhook
 */
app.post('/test', async (c) => {
  try {
    const { endpoint, event_type = 'test' } = await c.req.json()
    
    if (!endpoint) {
      return c.json({ error: 'Endpoint URL required' }, 400)
    }
    
    const testPayload = {
      type: event_type,
      data: {
        message: 'This is a test webhook notification',
        timestamp: new Date().toISOString()
      },
      source: 'CRS Webhook Test'
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CRS-Webhook/1.0'
      },
      body: JSON.stringify(testPayload)
    })
    
    const result = {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      response: response.ok ? await response.text() : null
    }
    
    return c.json(result)
    
  } catch (error) {
    console.error('Webhook test error:', error)
    return c.json({
      success: false,
      error: 'Webhook test failed',
      message: error.message
    }, 500)
  }
})

export default app