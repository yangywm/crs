import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { secureHeaders } from 'hono/secure-headers'

// 导入路由
import authRoutes from './routes/auth.js'
import apiRoutes from './routes/api.js'
import adminRoutes from './routes/admin.js'
import claudeRoutes from './routes/claude.js'
import geminiRoutes from './routes/gemini.js'
import openaiRoutes from './routes/openai.js'
import webhookRoutes from './routes/webhook.js'

// 导入中间件
import { authMiddleware } from './middleware/auth.js'
import { errorHandler } from './middleware/error.js'
import { rateLimitMiddleware } from './middleware/rateLimit.js'

// 导入服务
import { DatabaseService } from './services/database.js'
import { CacheService } from './services/cache.js'
import { LogService } from './services/log.js'

const app = new Hono()

// 全局中间件
app.use('*', logger())
app.use('*', prettyJSON())
app.use('*', secureHeaders())

// CORS配置
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://*.pages.dev', 'https://*.workers.dev'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}))

// 速率限制
app.use('/api/*', rateLimitMiddleware)

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: c.env.NODE_ENV || 'production'
  })
})

// API路由
app.route('/auth', authRoutes)
app.route('/api', apiRoutes)
app.route('/admin', adminRoutes)
app.route('/claude', claudeRoutes)
app.route('/gemini', geminiRoutes)
app.route('/openai', openaiRoutes)
app.route('/webhook', webhookRoutes)

// 静态文件服务（如果需要）
app.get('/assets/*', async (c) => {
  const path = c.req.path.replace('/assets/', '')
  try {
    const object = await c.env.STORAGE.get(`assets/${path}`)
    if (!object) {
      return c.notFound()
    }
    
    const headers = new Headers()
    headers.set('Cache-Control', 'public, max-age=31536000')
    
    // 设置正确的Content-Type
    if (path.endsWith('.css')) {
      headers.set('Content-Type', 'text/css')
    } else if (path.endsWith('.js')) {
      headers.set('Content-Type', 'application/javascript')
    } else if (path.endsWith('.png')) {
      headers.set('Content-Type', 'image/png')
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      headers.set('Content-Type', 'image/jpeg')
    } else if (path.endsWith('.svg')) {
      headers.set('Content-Type', 'image/svg+xml')
    }
    
    return new Response(object.body, { headers })
  } catch (error) {
    console.error('Error serving static file:', error)
    return c.notFound()
  }
})

// 错误处理
app.onError(errorHandler)

// 404处理
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404)
})

// 初始化服务
app.use('*', async (c, next) => {
  // 初始化数据库服务
  c.set('db', new DatabaseService(c.env.DB))
  
  // 初始化缓存服务
  c.set('cache', new CacheService(c.env.CACHE))
  
  // 初始化会话服务
  c.set('sessions', new CacheService(c.env.SESSIONS))
  
  // 初始化日志服务
  c.set('logger', new LogService(c.env.STORAGE))
  
  await next()
})

export default app