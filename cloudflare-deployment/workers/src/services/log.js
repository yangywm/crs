/**
 * 日志服务 - 使用Cloudflare R2存储日志
 */
export class LogService {
  constructor(r2Bucket) {
    this.r2 = r2Bucket
    this.logBuffer = []
    this.bufferSize = 100
    this.flushInterval = 60000 // 1分钟
    this.lastFlush = Date.now()
  }

  /**
   * 记录信息日志
   */
  info(message, data = {}) {
    this.log('info', message, data)
  }

  /**
   * 记录警告日志
   */
  warn(message, data = {}) {
    this.log('warn', message, data)
  }

  /**
   * 记录错误日志
   */
  error(message, data = {}) {
    this.log('error', message, data)
  }

  /**
   * 记录调试日志
   */
  debug(message, data = {}) {
    this.log('debug', message, data)
  }

  /**
   * 通用日志记录方法
   */
  log(level, message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      id: crypto.randomUUID()
    }

    // 添加到缓冲区
    this.logBuffer.push(logEntry)

    // 控制台输出（开发环境）
    if (typeof console !== 'undefined') {
      const consoleMethod = console[level] || console.log
      consoleMethod(`[${level.toUpperCase()}] ${message}`, data)
    }

    // 检查是否需要刷新缓冲区
    this.checkFlush()
  }

  /**
   * 检查是否需要刷新缓冲区
   */
  checkFlush() {
    const now = Date.now()
    const shouldFlush = 
      this.logBuffer.length >= this.bufferSize ||
      (now - this.lastFlush) >= this.flushInterval

    if (shouldFlush) {
      this.flush()
    }
  }

  /**
   * 刷新日志缓冲区到R2
   */
  async flush() {
    if (this.logBuffer.length === 0) return

    try {
      const logs = [...this.logBuffer]
      this.logBuffer = []
      this.lastFlush = Date.now()

      // 按日期组织日志文件
      const date = new Date().toISOString().split('T')[0]
      const hour = new Date().getHours().toString().padStart(2, '0')
      const filename = `logs/${date}/${hour}/app-${Date.now()}.json`

      // 上传到R2
      await this.r2.put(filename, JSON.stringify(logs, null, 2), {
        httpMetadata: {
          contentType: 'application/json'
        }
      })

    } catch (error) {
      console.error('Failed to flush logs to R2:', error)
      // 如果上传失败，将日志重新加入缓冲区
      this.logBuffer.unshift(...logs)
    }
  }

  /**
   * 获取日志文件列表
   */
  async getLogFiles(date = null, limit = 100) {
    try {
      const prefix = date ? `logs/${date}/` : 'logs/'
      const objects = await this.r2.list({ prefix, limit })
      
      return objects.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        etag: obj.etag
      }))
    } catch (error) {
      console.error('Failed to list log files:', error)
      return []
    }
  }

  /**
   * 获取日志内容
   */
  async getLogContent(filename) {
    try {
      const object = await this.r2.get(filename)
      if (!object) return null

      const content = await object.text()
      return JSON.parse(content)
    } catch (error) {
      console.error('Failed to get log content:', error)
      return null
    }
  }

  /**
   * 搜索日志
   */
  async searchLogs(query, startDate = null, endDate = null, level = null) {
    try {
      const results = []
      const files = await this.getLogFiles()

      for (const file of files) {
        // 根据文件名过滤日期范围
        if (startDate || endDate) {
          const fileDate = this.extractDateFromFilename(file.key)
          if (startDate && fileDate < startDate) continue
          if (endDate && fileDate > endDate) continue
        }

        const logs = await this.getLogContent(file.key)
        if (!logs) continue

        const matchingLogs = logs.filter(log => {
          // 级别过滤
          if (level && log.level !== level) return false

          // 文本搜索
          if (query) {
            const searchText = `${log.message} ${JSON.stringify(log.data)}`.toLowerCase()
            return searchText.includes(query.toLowerCase())
          }

          return true
        })

        results.push(...matchingLogs)
      }

      return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    } catch (error) {
      console.error('Failed to search logs:', error)
      return []
    }
  }

  /**
   * 从文件名提取日期
   */
  extractDateFromFilename(filename) {
    const match = filename.match(/logs\/(\d{4}-\d{2}-\d{2})\//)
    return match ? match[1] : null
  }

  /**
   * 清理旧日志
   */
  async cleanupOldLogs(daysToKeep = 30) {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

      const files = await this.getLogFiles()
      const filesToDelete = files.filter(file => {
        const fileDate = this.extractDateFromFilename(file.key)
        return fileDate && fileDate < cutoffDateStr
      })

      for (const file of filesToDelete) {
        await this.r2.delete(file.key)
      }

      this.info(`Cleaned up ${filesToDelete.length} old log files`)
      return filesToDelete.length
    } catch (error) {
      this.error('Failed to cleanup old logs', { error: error.message })
      return 0
    }
  }

  /**
   * 获取日志统计
   */
  async getLogStats(date = null) {
    try {
      const files = await this.getLogFiles(date)
      const stats = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        levels: { info: 0, warn: 0, error: 0, debug: 0 },
        hourlyDistribution: {}
      }

      // 分析部分文件获取级别统计
      const sampleFiles = files.slice(0, 10) // 只分析前10个文件
      for (const file of sampleFiles) {
        const logs = await this.getLogContent(file.key)
        if (!logs) continue

        logs.forEach(log => {
          if (stats.levels[log.level] !== undefined) {
            stats.levels[log.level]++
          }

          const hour = new Date(log.timestamp).getHours()
          stats.hourlyDistribution[hour] = (stats.hourlyDistribution[hour] || 0) + 1
        })
      }

      return stats
    } catch (error) {
      console.error('Failed to get log stats:', error)
      return null
    }
  }
}