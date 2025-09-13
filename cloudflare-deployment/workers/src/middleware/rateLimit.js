/**
 * 速率限制中间件
 * 使用Cloudflare KV实现分布式速率限制
 */

export const rateLimitMiddleware = async (c, next) => {
  const cache = c.get('cache')
  const apiKey = c.get('apiKey')
  
  if (!apiKey || !apiKey.limits) {
    return await next()
  }
  
  const limits = apiKey.limits
  const now = Date.now()
  
  // 检查速率限制
  if (limits.rate_limit) {
    const { requests_per_minute, requests_per_hour, requests_per_day } = limits.rate_limit
    
    // 检查每分钟限制
    if (requests_per_minute) {
      const minuteKey = `rate_limit:${apiKey.id}:minute:${Math.floor(now / 60000)}`
      const minuteCount = await cache.get(minuteKey) || 0
      
      if (minuteCount >= requests_per_minute) {
        return c.json({
          error: 'Rate limit exceeded',
          message: `Too many requests per minute. Limit: ${requests_per_minute}`,
          retry_after: 60 - (Math.floor(now / 1000) % 60)
        }, 429)
      }
      
      await cache.set(minuteKey, minuteCount + 1, 60)
    }
    
    // 检查每小时限制
    if (requests_per_hour) {
      const hourKey = `rate_limit:${apiKey.id}:hour:${Math.floor(now / 3600000)}`
      const hourCount = await cache.get(hourKey) || 0
      
      if (hourCount >= requests_per_hour) {
        return c.json({
          error: 'Rate limit exceeded',
          message: `Too many requests per hour. Limit: ${requests_per_hour}`,
          retry_after: 3600 - (Math.floor(now / 1000) % 3600)
        }, 429)
      }
      
      await cache.set(hourKey, hourCount + 1, 3600)
    }
    
    // 检查每日限制
    if (requests_per_day) {
      const dayKey = `rate_limit:${apiKey.id}:day:${Math.floor(now / 86400000)}`
      const dayCount = await cache.get(dayKey) || 0
      
      if (dayCount >= requests_per_day) {
        return c.json({
          error: 'Rate limit exceeded',
          message: `Too many requests per day. Limit: ${requests_per_day}`,
          retry_after: 86400 - (Math.floor(now / 1000) % 86400)
        }, 429)
      }
      
      await cache.set(dayKey, dayCount + 1, 86400)
    }
  }
  
  // 检查Token限制
  if (limits.token_limit) {
    const { tokens_per_minute, tokens_per_hour, tokens_per_day } = limits.token_limit
    
    // 这里需要在请求处理后更新Token使用量
    // 暂时跳过，在实际API调用后处理
  }
  
  await next()
}

/**
 * 更新Token使用量
 */
export const updateTokenUsage = async (cache, apiKeyId, tokenCount) => {
  const now = Date.now()
  
  // 更新每分钟Token使用量
  const minuteKey = `token_usage:${apiKeyId}:minute:${Math.floor(now / 60000)}`
  const minuteTokens = await cache.get(minuteKey) || 0
  await cache.set(minuteKey, minuteTokens + tokenCount, 60)
  
  // 更新每小时Token使用量
  const hourKey = `token_usage:${apiKeyId}:hour:${Math.floor(now / 3600000)}`
  const hourTokens = await cache.get(hourKey) || 0
  await cache.set(hourKey, hourTokens + tokenCount, 3600)
  
  // 更新每日Token使用量
  const dayKey = `token_usage:${apiKeyId}:day:${Math.floor(now / 86400000)}`
  const dayTokens = await cache.get(dayKey) || 0
  await cache.set(dayKey, dayTokens + tokenCount, 86400)
}

/**
 * 检查Token限制
 */
export const checkTokenLimit = async (cache, apiKey, estimatedTokens) => {
  if (!apiKey.limits || !apiKey.limits.token_limit) {
    return { allowed: true }
  }
  
  const { tokens_per_minute, tokens_per_hour, tokens_per_day } = apiKey.limits.token_limit
  const now = Date.now()
  
  // 检查每分钟Token限制
  if (tokens_per_minute) {
    const minuteKey = `token_usage:${apiKey.id}:minute:${Math.floor(now / 60000)}`
    const minuteTokens = await cache.get(minuteKey) || 0
    
    if (minuteTokens + estimatedTokens > tokens_per_minute) {
      return {
        allowed: false,
        error: 'Token limit exceeded',
        message: `Too many tokens per minute. Limit: ${tokens_per_minute}`,
        retry_after: 60 - (Math.floor(now / 1000) % 60)
      }
    }
  }
  
  // 检查每小时Token限制
  if (tokens_per_hour) {
    const hourKey = `token_usage:${apiKey.id}:hour:${Math.floor(now / 3600000)}`
    const hourTokens = await cache.get(hourKey) || 0
    
    if (hourTokens + estimatedTokens > tokens_per_hour) {
      return {
        allowed: false,
        error: 'Token limit exceeded',
        message: `Too many tokens per hour. Limit: ${tokens_per_hour}`,
        retry_after: 3600 - (Math.floor(now / 1000) % 3600)
      }
    }
  }
  
  // 检查每日Token限制
  if (tokens_per_day) {
    const dayKey = `token_usage:${apiKey.id}:day:${Math.floor(now / 86400000)}`
    const dayTokens = await cache.get(dayKey) || 0
    
    if (dayTokens + estimatedTokens > tokens_per_day) {
      return {
        allowed: false,
        error: 'Token limit exceeded',
        message: `Too many tokens per day. Limit: ${tokens_per_day}`,
        retry_after: 86400 - (Math.floor(now / 1000) % 86400)
      }
    }
  }
  
  return { allowed: true }
}

/**
 * IP速率限制中间件
 */
export const ipRateLimitMiddleware = async (c, next) => {
  const cache = c.get('cache')
  const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  
  // 基础IP速率限制：每分钟100请求
  const ipKey = `ip_rate_limit:${clientIP}:${Math.floor(Date.now() / 60000)}`
  const ipCount = await cache.get(ipKey) || 0
  
  if (ipCount >= 100) {
    return c.json({
      error: 'IP rate limit exceeded',
      message: 'Too many requests from this IP address',
      retry_after: 60
    }, 429)
  }
  
  await cache.set(ipKey, ipCount + 1, 60)
  
  await next()
}