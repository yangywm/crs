/**
 * 缓存服务 - 使用Cloudflare KV
 */
export class CacheService {
  constructor(kv) {
    this.kv = kv
  }

  /**
   * 设置缓存
   * @param {string} key 缓存键
   * @param {any} value 缓存值
   * @param {number} ttl 过期时间（秒）
   */
  async set(key, value, ttl = 3600) {
    const data = {
      value,
      timestamp: Date.now(),
      ttl: ttl * 1000 // 转换为毫秒
    }
    
    await this.kv.put(key, JSON.stringify(data), {
      expirationTtl: ttl
    })
  }

  /**
   * 获取缓存
   * @param {string} key 缓存键
   * @returns {any} 缓存值，如果不存在或过期返回null
   */
  async get(key) {
    const data = await this.kv.get(key)
    if (!data) return null
    
    try {
      const parsed = JSON.parse(data)
      
      // 检查是否过期（双重保险）
      if (parsed.ttl && Date.now() - parsed.timestamp > parsed.ttl) {
        await this.delete(key)
        return null
      }
      
      return parsed.value
    } catch (error) {
      console.error('Error parsing cached data:', error)
      await this.delete(key)
      return null
    }
  }

  /**
   * 删除缓存
   * @param {string} key 缓存键
   */
  async delete(key) {
    await this.kv.delete(key)
  }

  /**
   * 检查缓存是否存在
   * @param {string} key 缓存键
   * @returns {boolean}
   */
  async exists(key) {
    const value = await this.kv.get(key)
    return value !== null
  }

  /**
   * 设置会话
   * @param {string} sessionId 会话ID
   * @param {object} sessionData 会话数据
   * @param {number} ttl 过期时间（秒）
   */
  async setSession(sessionId, sessionData, ttl = 86400) {
    await this.set(`session:${sessionId}`, sessionData, ttl)
  }

  /**
   * 获取会话
   * @param {string} sessionId 会话ID
   * @returns {object|null} 会话数据
   */
  async getSession(sessionId) {
    return await this.get(`session:${sessionId}`)
  }

  /**
   * 删除会话
   * @param {string} sessionId 会话ID
   */
  async deleteSession(sessionId) {
    await this.delete(`session:${sessionId}`)
  }

  /**
   * 设置速率限制
   * @param {string} key 限制键（通常是IP或API Key）
   * @param {number} count 当前计数
   * @param {number} windowSeconds 时间窗口（秒）
   */
  async setRateLimit(key, count, windowSeconds) {
    const rateLimitKey = `rate_limit:${key}`
    await this.set(rateLimitKey, count, windowSeconds)
  }

  /**
   * 获取速率限制
   * @param {string} key 限制键
   * @returns {number|null} 当前计数
   */
  async getRateLimit(key) {
    const rateLimitKey = `rate_limit:${key}`
    return await this.get(rateLimitKey)
  }

  /**
   * 增加速率限制计数
   * @param {string} key 限制键
   * @param {number} windowSeconds 时间窗口（秒）
   * @returns {number} 新的计数值
   */
  async incrementRateLimit(key, windowSeconds = 3600) {
    const rateLimitKey = `rate_limit:${key}`
    const current = await this.get(rateLimitKey) || 0
    const newCount = current + 1
    
    await this.set(rateLimitKey, newCount, windowSeconds)
    return newCount
  }

  /**
   * 缓存API响应
   * @param {string} cacheKey 缓存键
   * @param {object} response 响应数据
   * @param {number} ttl 缓存时间（秒）
   */
  async cacheApiResponse(cacheKey, response, ttl = 300) {
    await this.set(`api_cache:${cacheKey}`, response, ttl)
  }

  /**
   * 获取缓存的API响应
   * @param {string} cacheKey 缓存键
   * @returns {object|null} 缓存的响应
   */
  async getCachedApiResponse(cacheKey) {
    return await this.get(`api_cache:${cacheKey}`)
  }

  /**
   * 缓存账户状态
   * @param {string} accountId 账户ID
   * @param {object} status 状态信息
   * @param {number} ttl 缓存时间（秒）
   */
  async cacheAccountStatus(accountId, status, ttl = 600) {
    await this.set(`account_status:${accountId}`, status, ttl)
  }

  /**
   * 获取缓存的账户状态
   * @param {string} accountId 账户ID
   * @returns {object|null} 账户状态
   */
  async getCachedAccountStatus(accountId) {
    return await this.get(`account_status:${accountId}`)
  }

  /**
   * 批量删除缓存（按前缀）
   * 注意：KV不支持按前缀删除，这里提供一个模拟实现
   * @param {string} prefix 前缀
   */
  async deleteByPrefix(prefix) {
    // KV不支持列出所有键，所以这个功能有限
    // 在实际使用中，建议维护一个键列表来实现批量删除
    console.warn('KV does not support prefix-based deletion. Consider maintaining a key list.')
  }

  /**
   * 获取缓存统计信息
   * @returns {object} 统计信息
   */
  async getStats() {
    // KV不提供统计信息，返回基本信息
    return {
      provider: 'Cloudflare KV',
      timestamp: new Date().toISOString(),
      note: 'KV does not provide detailed statistics'
    }
  }
}