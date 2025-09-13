/**
 * 错误处理中间件
 */

export const errorHandler = (error, c) => {
  console.error('Application error:', error)
  
  // 记录错误到日志服务
  const logger = c.get('logger')
  if (logger) {
    logger.error('Application error', {
      error: error.message,
      stack: error.stack,
      path: c.req.path,
      method: c.req.method,
      headers: Object.fromEntries(c.req.headers.entries()),
      timestamp: new Date().toISOString()
    })
  }
  
  // 根据错误类型返回不同的响应
  if (error.name === 'ValidationError') {
    return c.json({
      error: 'Validation Error',
      message: error.message,
      details: error.details || null
    }, 400)
  }
  
  if (error.name === 'AuthenticationError') {
    return c.json({
      error: 'Authentication Error',
      message: error.message || 'Authentication failed'
    }, 401)
  }
  
  if (error.name === 'AuthorizationError') {
    return c.json({
      error: 'Authorization Error',
      message: error.message || 'Access denied'
    }, 403)
  }
  
  if (error.name === 'NotFoundError') {
    return c.json({
      error: 'Not Found',
      message: error.message || 'Resource not found'
    }, 404)
  }
  
  if (error.name === 'RateLimitError') {
    return c.json({
      error: 'Rate Limit Exceeded',
      message: error.message || 'Too many requests',
      retry_after: error.retryAfter || 60
    }, 429)
  }
  
  // 生产环境隐藏详细错误信息
  const isProduction = c.env.NODE_ENV === 'production'
  
  return c.json({
    error: 'Internal Server Error',
    message: isProduction ? 'An unexpected error occurred' : error.message,
    ...(isProduction ? {} : { stack: error.stack })
  }, 500)
}

/**
 * 自定义错误类
 */
export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Access denied') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded', retryAfter = 60) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

/**
 * 异步错误包装器
 */
export const asyncHandler = (fn) => {
  return async (c, next) => {
    try {
      await fn(c, next)
    } catch (error) {
      throw error
    }
  }
}