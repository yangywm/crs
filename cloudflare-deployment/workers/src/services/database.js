/**
 * 数据库服务 - 使用Cloudflare D1
 */
export class DatabaseService {
  constructor(db) {
    this.db = db
  }

  // 用户管理
  async createUser(userData) {
    const { username, password, email, role = 'user' } = userData
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    
    const result = await this.db.prepare(`
      INSERT INTO users (id, username, password, email, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, username, password, email, role, createdAt, createdAt).run()
    
    return { id, ...userData, created_at: createdAt }
  }

  async getUserByUsername(username) {
    const result = await this.db.prepare(`
      SELECT * FROM users WHERE username = ?
    `).bind(username).first()
    
    return result
  }

  async getUserById(id) {
    const result = await this.db.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(id).first()
    
    return result
  }

  async updateUser(id, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ')
    const values = Object.values(updates)
    const updatedAt = new Date().toISOString()
    
    await this.db.prepare(`
      UPDATE users SET ${fields}, updated_at = ? WHERE id = ?
    `).bind(...values, updatedAt, id).run()
    
    return this.getUserById(id)
  }

  // Claude账户管理
  async createClaudeAccount(accountData) {
    const { name, authorization, proxy_config, group_id } = accountData
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    
    await this.db.prepare(`
      INSERT INTO claude_accounts (id, name, authorization, proxy_config, group_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(id, name, authorization, JSON.stringify(proxy_config), group_id, createdAt, createdAt).run()
    
    return { id, ...accountData, status: 'active', created_at: createdAt }
  }

  async getClaudeAccounts(filters = {}) {
    let query = 'SELECT * FROM claude_accounts WHERE 1=1'
    const params = []
    
    if (filters.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }
    
    if (filters.group_id) {
      query += ' AND group_id = ?'
      params.push(filters.group_id)
    }
    
    query += ' ORDER BY created_at DESC'
    
    const result = await this.db.prepare(query).bind(...params).all()
    
    return result.results.map(account => ({
      ...account,
      proxy_config: account.proxy_config ? JSON.parse(account.proxy_config) : null
    }))
  }

  async updateClaudeAccount(id, updates) {
    const fields = []
    const values = []
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'proxy_config') {
        fields.push(`${key} = ?`)
        values.push(JSON.stringify(value))
      } else {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    })
    
    const updatedAt = new Date().toISOString()
    fields.push('updated_at = ?')
    values.push(updatedAt)
    
    await this.db.prepare(`
      UPDATE claude_accounts SET ${fields.join(', ')} WHERE id = ?
    `).bind(...values, id).run()
    
    return this.getClaudeAccountById(id)
  }

  async getClaudeAccountById(id) {
    const result = await this.db.prepare(`
      SELECT * FROM claude_accounts WHERE id = ?
    `).bind(id).first()
    
    if (result && result.proxy_config) {
      result.proxy_config = JSON.parse(result.proxy_config)
    }
    
    return result
  }

  // API Key管理
  async createApiKey(keyData) {
    const { name, key, user_id, limits, client_restrictions } = keyData
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    
    await this.db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, user_id, limits, client_restrictions, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      id, 
      name, 
      key, 
      user_id, 
      JSON.stringify(limits), 
      JSON.stringify(client_restrictions), 
      createdAt, 
      createdAt
    ).run()
    
    return { id, ...keyData, status: 'active', created_at: createdAt }
  }

  async getApiKeys(filters = {}) {
    let query = 'SELECT * FROM api_keys WHERE 1=1'
    const params = []
    
    if (filters.user_id) {
      query += ' AND user_id = ?'
      params.push(filters.user_id)
    }
    
    if (filters.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }
    
    query += ' ORDER BY created_at DESC'
    
    const result = await this.db.prepare(query).bind(...params).all()
    
    return result.results.map(key => ({
      ...key,
      limits: key.limits ? JSON.parse(key.limits) : null,
      client_restrictions: key.client_restrictions ? JSON.parse(key.client_restrictions) : null
    }))
  }

  async getApiKeyByHash(keyHash) {
    const result = await this.db.prepare(`
      SELECT * FROM api_keys WHERE key_hash = ? AND status = 'active'
    `).bind(keyHash).first()
    
    if (result) {
      result.limits = result.limits ? JSON.parse(result.limits) : null
      result.client_restrictions = result.client_restrictions ? JSON.parse(result.client_restrictions) : null
    }
    
    return result
  }

  // 使用统计
  async recordUsage(usageData) {
    const { api_key_id, model, input_tokens, output_tokens, cost, request_id } = usageData
    const id = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    
    await this.db.prepare(`
      INSERT INTO usage_stats (id, api_key_id, model, input_tokens, output_tokens, cost, request_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, api_key_id, model, input_tokens, output_tokens, cost, request_id, timestamp).run()
    
    return { id, ...usageData, timestamp }
  }

  async getUsageStats(filters = {}) {
    let query = `
      SELECT 
        us.*,
        ak.name as api_key_name,
        u.username
      FROM usage_stats us
      LEFT JOIN api_keys ak ON us.api_key_id = ak.id
      LEFT JOIN users u ON ak.user_id = u.id
      WHERE 1=1
    `
    const params = []
    
    if (filters.api_key_id) {
      query += ' AND us.api_key_id = ?'
      params.push(filters.api_key_id)
    }
    
    if (filters.user_id) {
      query += ' AND ak.user_id = ?'
      params.push(filters.user_id)
    }
    
    if (filters.start_date) {
      query += ' AND us.timestamp >= ?'
      params.push(filters.start_date)
    }
    
    if (filters.end_date) {
      query += ' AND us.timestamp <= ?'
      params.push(filters.end_date)
    }
    
    query += ' ORDER BY us.timestamp DESC'
    
    if (filters.limit) {
      query += ' LIMIT ?'
      params.push(filters.limit)
    }
    
    const result = await this.db.prepare(query).bind(...params).all()
    return result.results
  }

  // 系统设置
  async getSetting(key) {
    const result = await this.db.prepare(`
      SELECT value FROM settings WHERE key = ?
    `).bind(key).first()
    
    return result ? JSON.parse(result.value) : null
  }

  async setSetting(key, value) {
    const timestamp = new Date().toISOString()
    
    await this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `).bind(key, JSON.stringify(value), timestamp).run()
    
    return { key, value, updated_at: timestamp }
  }

  // 数据库初始化
  async initialize() {
    // 这个方法在数据库迁移时调用
    console.log('Database service initialized')
  }
}