#!/usr/bin/env node

/**
 * 数据迁移脚本
 * 从传统Redis部署迁移到Cloudflare D1
 */

const fs = require('fs')
const path = require('path')
const Redis = require('ioredis')

class DataMigrator {
  constructor(options = {}) {
    this.redisConfig = options.redis || {
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0
    }
    
    this.outputDir = options.outputDir || './migration-data'
    this.redis = null
  }

  async connect() {
    console.log('🔗 连接到Redis...')
    this.redis = new Redis(this.redisConfig)
    
    try {
      await this.redis.ping()
      console.log('✅ Redis连接成功')
    } catch (error) {
      console.error('❌ Redis连接失败:', error.message)
      throw error
    }
  }

  async disconnect() {
    if (this.redis) {
      await this.redis.disconnect()
      console.log('🔌 Redis连接已断开')
    }
  }

  async exportData() {
    console.log('📤 开始导出数据...')
    
    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }

    const data = {
      users: await this.exportUsers(),
      claudeAccounts: await this.exportClaudeAccounts(),
      apiKeys: await this.exportApiKeys(),
      usageStats: await this.exportUsageStats(),
      settings: await this.exportSettings(),
      exportTime: new Date().toISOString()
    }

    // 保存到文件
    const exportFile = path.join(this.outputDir, 'crs-export.json')
    fs.writeFileSync(exportFile, JSON.stringify(data, null, 2))
    
    console.log(`✅ 数据导出完成: ${exportFile}`)
    return data
  }

  async exportUsers() {
    console.log('👥 导出用户数据...')
    const users = []
    
    try {
      const userKeys = await this.redis.keys('user:*')
      
      for (const key of userKeys) {
        const userData = await this.redis.hgetall(key)
        if (userData && userData.username) {
          users.push({
            id: userData.id || key.replace('user:', ''),
            username: userData.username,
            password: userData.password,
            email: userData.email,
            role: userData.role || 'user',
            status: userData.status || 'active',
            created_at: userData.created_at || new Date().toISOString(),
            updated_at: userData.updated_at || new Date().toISOString()
          })
        }
      }
      
      console.log(`  导出 ${users.length} 个用户`)
    } catch (error) {
      console.warn('⚠️  用户数据导出失败:', error.message)
    }
    
    return users
  }

  async exportClaudeAccounts() {
    console.log('🤖 导出Claude账户数据...')
    const accounts = []
    
    try {
      const accountKeys = await this.redis.keys('claude_account:*')
      
      for (const key of accountKeys) {
        const accountData = await this.redis.hgetall(key)
        if (accountData && accountData.name) {
          accounts.push({
            id: accountData.id || key.replace('claude_account:', ''),
            name: accountData.name,
            authorization: accountData.authorization,
            proxy_config: accountData.proxy_config ? JSON.parse(accountData.proxy_config) : null,
            group_id: accountData.group_id,
            status: accountData.status || 'active',
            last_used_at: accountData.last_used_at,
            error_count: parseInt(accountData.error_count) || 0,
            created_at: accountData.created_at || new Date().toISOString(),
            updated_at: accountData.updated_at || new Date().toISOString()
          })
        }
      }
      
      console.log(`  导出 ${accounts.length} 个Claude账户`)
    } catch (error) {
      console.warn('⚠️  Claude账户数据导出失败:', error.message)
    }
    
    return accounts
  }

  async exportApiKeys() {
    console.log('🔑 导出API Key数据...')
    const apiKeys = []
    
    try {
      const keyKeys = await this.redis.keys('api_key:*')
      
      for (const key of keyKeys) {
        const keyData = await this.redis.hgetall(key)
        if (keyData && keyData.name) {
          apiKeys.push({
            id: keyData.id || key.replace('api_key:', ''),
            name: keyData.name,
            key_hash: keyData.key_hash,
            user_id: keyData.user_id,
            limits: keyData.limits ? JSON.parse(keyData.limits) : null,
            client_restrictions: keyData.client_restrictions ? JSON.parse(keyData.client_restrictions) : null,
            status: keyData.status || 'active',
            expires_at: keyData.expires_at,
            last_used_at: keyData.last_used_at,
            usage_count: parseInt(keyData.usage_count) || 0,
            created_at: keyData.created_at || new Date().toISOString(),
            updated_at: keyData.updated_at || new Date().toISOString()
          })
        }
      }
      
      console.log(`  导出 ${apiKeys.length} 个API Key`)
    } catch (error) {
      console.warn('⚠️  API Key数据导出失败:', error.message)
    }
    
    return apiKeys
  }

  async exportUsageStats() {
    console.log('📊 导出使用统计数据...')
    const usageStats = []
    
    try {
      const statsKeys = await this.redis.keys('usage_stat:*')
      
      for (const key of statsKeys) {
        const statData = await this.redis.hgetall(key)
        if (statData && statData.api_key_id) {
          usageStats.push({
            id: statData.id || key.replace('usage_stat:', ''),
            api_key_id: statData.api_key_id,
            account_id: statData.account_id,
            account_type: statData.account_type || 'claude',
            model: statData.model,
            input_tokens: parseInt(statData.input_tokens) || 0,
            output_tokens: parseInt(statData.output_tokens) || 0,
            cost: parseFloat(statData.cost) || 0,
            request_id: statData.request_id,
            user_agent: statData.user_agent,
            ip_address: statData.ip_address,
            timestamp: statData.timestamp || new Date().toISOString()
          })
        }
      }
      
      console.log(`  导出 ${usageStats.length} 条使用统计`)
    } catch (error) {
      console.warn('⚠️  使用统计数据导出失败:', error.message)
    }
    
    return usageStats
  }

  async exportSettings() {
    console.log('⚙️  导出系统设置...')
    const settings = {}
    
    try {
      const settingKeys = await this.redis.keys('setting:*')
      
      for (const key of settingKeys) {
        const settingValue = await this.redis.get(key)
        if (settingValue) {
          const settingKey = key.replace('setting:', '')
          try {
            settings[settingKey] = JSON.parse(settingValue)
          } catch {
            settings[settingKey] = settingValue
          }
        }
      }
      
      console.log(`  导出 ${Object.keys(settings).length} 个设置项`)
    } catch (error) {
      console.warn('⚠️  系统设置导出失败:', error.message)
    }
    
    return settings
  }

  generateD1ImportSQL(data) {
    console.log('🔄 生成D1导入SQL...')
    
    const sql = []
    
    // 导入用户
    if (data.users && data.users.length > 0) {
      sql.push('-- 导入用户数据')
      for (const user of data.users) {
        sql.push(`INSERT OR REPLACE INTO users (id, username, password, email, role, status, created_at, updated_at) VALUES (
          '${user.id}',
          '${user.username}',
          '${user.password}',
          '${user.email || ''}',
          '${user.role}',
          '${user.status}',
          '${user.created_at}',
          '${user.updated_at}'
        );`)
      }
      sql.push('')
    }

    // 导入Claude账户
    if (data.claudeAccounts && data.claudeAccounts.length > 0) {
      sql.push('-- 导入Claude账户数据')
      for (const account of data.claudeAccounts) {
        sql.push(`INSERT OR REPLACE INTO claude_accounts (id, name, authorization, proxy_config, group_id, status, last_used_at, error_count, created_at, updated_at) VALUES (
          '${account.id}',
          '${account.name}',
          '${account.authorization}',
          '${account.proxy_config ? JSON.stringify(account.proxy_config).replace(/'/g, "''") : ''}',
          '${account.group_id || ''}',
          '${account.status}',
          '${account.last_used_at || ''}',
          ${account.error_count},
          '${account.created_at}',
          '${account.updated_at}'
        );`)
      }
      sql.push('')
    }

    // 导入API Keys
    if (data.apiKeys && data.apiKeys.length > 0) {
      sql.push('-- 导入API Key数据')
      for (const apiKey of data.apiKeys) {
        sql.push(`INSERT OR REPLACE INTO api_keys (id, name, key_hash, user_id, limits, client_restrictions, status, expires_at, last_used_at, usage_count, created_at, updated_at) VALUES (
          '${apiKey.id}',
          '${apiKey.name}',
          '${apiKey.key_hash}',
          '${apiKey.user_id || ''}',
          '${apiKey.limits ? JSON.stringify(apiKey.limits).replace(/'/g, "''") : ''}',
          '${apiKey.client_restrictions ? JSON.stringify(apiKey.client_restrictions).replace(/'/g, "''") : ''}',
          '${apiKey.status}',
          '${apiKey.expires_at || ''}',
          '${apiKey.last_used_at || ''}',
          ${apiKey.usage_count},
          '${apiKey.created_at}',
          '${apiKey.updated_at}'
        );`)
      }
      sql.push('')
    }

    // 导入系统设置
    if (data.settings && Object.keys(data.settings).length > 0) {
      sql.push('-- 导入系统设置')
      for (const [key, value] of Object.entries(data.settings)) {
        sql.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (
          '${key}',
          '${JSON.stringify(value).replace(/'/g, "''")}',
          '${new Date().toISOString()}'
        );`)
      }
    }

    const sqlContent = sql.join('\n')
    const sqlFile = path.join(this.outputDir, 'import.sql')
    fs.writeFileSync(sqlFile, sqlContent)
    
    console.log(`✅ SQL导入文件生成完成: ${sqlFile}`)
    return sqlFile
  }
}

// 命令行接口
async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
CRS数据迁移工具

用法:
  node migrate-data.js [选项]

选项:
  --redis-host HOST     Redis主机地址 (默认: localhost)
  --redis-port PORT     Redis端口 (默认: 6379)
  --redis-password PWD  Redis密码
  --redis-db DB         Redis数据库编号 (默认: 0)
  --output-dir DIR      输出目录 (默认: ./migration-data)
  --help, -h            显示帮助信息

示例:
  node migrate-data.js --redis-host 127.0.0.1 --redis-port 6379
  node migrate-data.js --output-dir /tmp/crs-migration
`)
    return
  }

  // 解析命令行参数
  const config = {
    redis: {
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0
    },
    outputDir: './migration-data'
  }

  for (let i = 0; i < args.length; i += 2) {
    const arg = args[i]
    const value = args[i + 1]
    
    switch (arg) {
      case '--redis-host':
        config.redis.host = value
        break
      case '--redis-port':
        config.redis.port = parseInt(value)
        break
      case '--redis-password':
        config.redis.password = value
        break
      case '--redis-db':
        config.redis.db = parseInt(value)
        break
      case '--output-dir':
        config.outputDir = value
        break
    }
  }

  const migrator = new DataMigrator(config)

  try {
    await migrator.connect()
    const data = await migrator.exportData()
    migrator.generateD1ImportSQL(data)
    
    console.log('\n🎉 数据迁移准备完成！')
    console.log('\n下一步操作:')
    console.log('1. 检查导出的数据文件')
    console.log('2. 使用以下命令导入到D1数据库:')
    console.log(`   wrangler d1 execute crs-database --file=${path.join(config.outputDir, 'import.sql')}`)
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message)
    process.exit(1)
  } finally {
    await migrator.disconnect()
  }
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { DataMigrator }