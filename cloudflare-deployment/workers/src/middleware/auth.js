import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

/**
 * JWT认证中间件
 */
export const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const apiKey = c.req.header('X-API-Key')
  
  // API Key认证
  if (apiKey) {
    try {
      const db = c.get('db')
      const keyHash = await bcrypt.hash(apiKey, 10)
      const apiKeyData = await db.getApiKeyByHash(keyHash)
      
      if (!apiKeyData) {
        return c.json({ error: 'Invalid API key' }, 401)
      }
      
      // 检查API Key状态
      if (apiKeyData.status !== 'active') {
        return c.json({ error: 'API key is disabled' }, 401)
      }
      
      // 设置用户信息
      c.set('apiKey', apiKeyData)
      c.set('user', await db.getUserById(apiKeyData.user_id))
      
      return await next()
    } catch (error) {
      console.error('API Key authentication error:', error)
      return c.json({ error: 'Authentication failed' }, 401)
    }
  }
  
  // JWT认证
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    
    try {
      const decoded = jwt.verify(token, c.env.JWT_SECRET)
      const db = c.get('db')
      const user = await db.getUserById(decoded.userId)
      
      if (!user) {
        return c.json({ error: 'User not found' }, 401)
      }
      
      c.set('user', user)
      return await next()
    } catch (error) {
      console.error('JWT authentication error:', error)
      return c.json({ error: 'Invalid token' }, 401)
    }
  }
  
  return c.json({ error: 'Authentication required' }, 401)
}

/**
 * 管理员权限中间件
 */
export const adminMiddleware = async (c, next) => {
  const user = c.get('user')
  
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }
  
  await next()
}

/**
 * 用户权限中间件
 */
export const userMiddleware = async (c, next) => {
  const user = c.get('user')
  
  if (!user) {
    return c.json({ error: 'User access required' }, 403)
  }
  
  await next()
}

/**
 * API Key验证中间件
 */
export const apiKeyMiddleware = async (c, next) => {
  const apiKey = c.req.header('X-API-Key') || c.req.query('api_key')
  
  if (!apiKey) {
    return c.json({ error: 'API key required' }, 401)
  }
  
  try {
    const db = c.get('db')
    const cache = c.get('cache')
    
    // 先从缓存获取
    let apiKeyData = await cache.get(`api_key:${apiKey}`)
    
    if (!apiKeyData) {
      // 缓存未命中，从数据库获取
      const keyHash = await bcrypt.hash(apiKey, 10)
      apiKeyData = await db.getApiKeyByHash(keyHash)
      
      if (apiKeyData) {
        // 缓存API Key信息（5分钟）
        await cache.set(`api_key:${apiKey}`, apiKeyData, 300)
      }
    }
    
    if (!apiKeyData) {
      return c.json({ error: 'Invalid API key' }, 401)
    }
    
    // 检查API Key状态
    if (apiKeyData.status !== 'active') {
      return c.json({ error: 'API key is disabled' }, 401)
    }
    
    // 检查客户端限制
    if (apiKeyData.client_restrictions && apiKeyData.client_restrictions.enabled) {
      const userAgent = c.req.header('User-Agent') || ''
      const allowedClients = apiKeyData.client_restrictions.clients || []
      
      if (allowedClients.length > 0) {
        const isAllowed = allowedClients.some(clientId => {
          // 这里需要根据客户端ID匹配User-Agent
          // 具体实现取决于客户端限制的配置
          return checkClientUserAgent(clientId, userAgent)
        })
        
        if (!isAllowed) {
          return c.json({ error: 'Client not allowed' }, 403)
        }
      }
    }
    
    // 设置API Key信息
    c.set('apiKey', apiKeyData)
    
    // 获取用户信息
    if (apiKeyData.user_id) {
      let user = await cache.get(`user:${apiKeyData.user_id}`)
      if (!user) {
        user = await db.getUserById(apiKeyData.user_id)
        if (user) {
          await cache.set(`user:${apiKeyData.user_id}`, user, 300)
        }
      }
      c.set('user', user)
    }
    
    await next()
  } catch (error) {
    console.error('API Key validation error:', error)
    return c.json({ error: 'Authentication failed' }, 401)
  }
}

/**
 * 检查客户端User-Agent
 */
function checkClientUserAgent(clientId, userAgent) {
  const clientPatterns = {
    'claude_code': /^claude-cli\/[\d.]+\s+\(/i,
    'gemini_cli': /^GeminiCLI\/v?[\d.]+\s+\(/i,
    // 可以添加更多客户端模式
  }
  
  const pattern = clientPatterns[clientId]
  return pattern ? pattern.test(userAgent) : false
}

/**
 * 生成JWT Token
 */
export const generateToken = (payload, secret, expiresIn = '24h') => {
  return jwt.sign(payload, secret, { expiresIn })
}

/**
 * 验证JWT Token
 */
export const verifyToken = (token, secret) => {
  return jwt.verify(token, secret)
}

/**
 * 生成API Key
 */
export const generateApiKey = (prefix = 'cr_') => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32))
  const randomString = Array.from(randomBytes, byte => 
    byte.toString(16).padStart(2, '0')
  ).join('')
  
  return `${prefix}${randomString}`
}

/**
 * 哈希API Key
 */
export const hashApiKey = async (apiKey) => {
  return await bcrypt.hash(apiKey, 10)
}

/**
 * 验证API Key
 */
export const verifyApiKey = async (apiKey, hash) => {
  return await bcrypt.compare(apiKey, hash)
}