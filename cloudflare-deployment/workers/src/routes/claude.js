import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { apiKeyMiddleware } from '../middleware/auth.js'
import { rateLimitMiddleware } from '../middleware/rateLimit.js'

const app = new Hono()

// 应用中间件
app.use('*', apiKeyMiddleware)
app.use('*', rateLimitMiddleware)

/**
 * Claude API代理路由
 * 兼容Anthropic API格式
 */
app.post('/v1/messages', async (c) => {
  try {
    const apiKey = c.get('apiKey')
    const db = c.get('db')
    const logger = c.get('logger')
    
    // 获取请求体
    const requestBody = await c.req.json()
    
    // 获取可用的Claude账户
    const accounts = await db.getClaudeAccounts({ status: 'active' })
    if (accounts.length === 0) {
      return c.json({ error: 'No active Claude accounts available' }, 503)
    }
    
    // 选择账户（简单轮询，可以改进为更智能的选择策略）
    const account = accounts[Math.floor(Math.random() * accounts.length)]
    
    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': account.authorization,
      'anthropic-version': c.env.CLAUDE_API_VERSION,
      'anthropic-beta': c.env.CLAUDE_BETA_HEADER,
      'User-Agent': 'CRS-Proxy/1.0'
    }
    
    // 代理配置
    let fetchOptions = {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    }
    
    // 如果账户配置了代理
    if (account.proxy_config && account.proxy_config.enabled) {
      // 在Workers环境中，代理需要特殊处理
      // 这里简化处理，实际可能需要使用fetch的代理选项
    }
    
    // 发送请求到Claude API
    const response = await fetch(c.env.CLAUDE_API_URL, fetchOptions)
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Claude API error:', {
        status: response.status,
        error: errorText,
        account_id: account.id
      })
      
      // 如果是401错误，标记账户为无效
      if (response.status === 401) {
        await db.updateClaudeAccount(account.id, { status: 'invalid' })
      }
      
      return c.json({ 
        error: 'Claude API request failed',
        details: errorText 
      }, response.status)
    }
    
    // 处理流式响应
    if (requestBody.stream) {
      return stream(c, async (stream) => {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const chunk = decoder.decode(value, { stream: true })
            await stream.write(chunk)
          }
        } catch (error) {
          logger.error('Stream processing error:', error)
          await stream.write(`data: {"error": "Stream processing failed"}\n\n`)
        } finally {
          reader.releaseLock()
        }
      })
    }
    
    // 处理普通响应
    const responseData = await response.json()
    
    // 记录使用统计
    if (responseData.usage) {
      await db.recordUsage({
        api_key_id: apiKey.id,
        model: requestBody.model || 'claude-3-sonnet',
        input_tokens: responseData.usage.input_tokens || 0,
        output_tokens: responseData.usage.output_tokens || 0,
        cost: calculateCost(responseData.usage, requestBody.model),
        request_id: crypto.randomUUID()
      })
    }
    
    // 记录成功请求
    logger.info('Claude API request successful', {
      account_id: account.id,
      api_key_id: apiKey.id,
      model: requestBody.model,
      tokens: responseData.usage
    })
    
    return c.json(responseData)
    
  } catch (error) {
    console.error('Claude proxy error:', error)
    return c.json({ 
      error: 'Internal server error',
      message: error.message 
    }, 500)
  }
})

/**
 * 获取可用模型列表
 */
app.get('/v1/models', async (c) => {
  const models = [
    {
      id: 'claude-3-opus-20240229',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic'
    },
    {
      id: 'claude-3-sonnet-20240229',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic'
    },
    {
      id: 'claude-3-haiku-20240307',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic'
    },
    {
      id: 'claude-sonnet-4-20250514',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic'
    },
    {
      id: 'claude-opus-4-20250514',
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic'
    }
  ]
  
  return c.json({
    object: 'list',
    data: models
  })
})

/**
 * 计算使用成本
 */
function calculateCost(usage, model) {
  const pricing = {
    'claude-3-opus-20240229': { input: 15, output: 75 },
    'claude-3-sonnet-20240229': { input: 3, output: 15 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-opus-4-20250514': { input: 15, output: 75 }
  }
  
  const modelPricing = pricing[model] || pricing['claude-3-sonnet-20240229']
  const inputCost = (usage.input_tokens / 1000000) * modelPricing.input
  const outputCost = (usage.output_tokens / 1000000) * modelPricing.output
  
  return inputCost + outputCost
}

export default app