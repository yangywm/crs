import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { generateToken } from '../middleware/auth.js'

const app = new Hono()

/**
 * 管理员登录
 */
app.post('/admin/login', async (c) => {
  try {
    const { username, password } = await c.req.json()
    
    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400)
    }
    
    const db = c.get('db')
    const user = await db.getUserByUsername(username)
    
    if (!user || user.role !== 'admin') {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    // 生成JWT Token
    const token = generateToken(
      { userId: user.id, username: user.username, role: user.role },
      c.env.JWT_SECRET,
      '24h'
    )
    
    // 创建会话
    const sessions = c.get('sessions')
    const sessionId = crypto.randomUUID()
    await sessions.setSession(sessionId, {
      userId: user.id,
      username: user.username,
      role: user.role,
      loginTime: new Date().toISOString()
    }, 86400) // 24小时
    
    return c.json({
      success: true,
      token,
      sessionId,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    })
    
  } catch (error) {
    console.error('Admin login error:', error)
    return c.json({ error: 'Login failed' }, 500)
  }
})

/**
 * 用户登录
 */
app.post('/user/login', async (c) => {
  try {
    const { username, password } = await c.req.json()
    
    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400)
    }
    
    const db = c.get('db')
    const user = await db.getUserByUsername(username)
    
    if (!user || user.status !== 'active') {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    
    // 生成JWT Token
    const token = generateToken(
      { userId: user.id, username: user.username, role: user.role },
      c.env.JWT_SECRET,
      '24h'
    )
    
    // 创建会话
    const sessions = c.get('sessions')
    const sessionId = crypto.randomUUID()
    await sessions.setSession(sessionId, {
      userId: user.id,
      username: user.username,
      role: user.role,
      loginTime: new Date().toISOString()
    }, 86400) // 24小时
    
    return c.json({
      success: true,
      token,
      sessionId,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    })
    
  } catch (error) {
    console.error('User login error:', error)
    return c.json({ error: 'Login failed' }, 500)
  }
})

/**
 * 登出
 */
app.post('/logout', async (c) => {
  try {
    const sessionId = c.req.header('X-Session-ID')
    
    if (sessionId) {
      const sessions = c.get('sessions')
      await sessions.deleteSession(sessionId)
    }
    
    return c.json({ success: true, message: 'Logged out successfully' })
    
  } catch (error) {
    console.error('Logout error:', error)
    return c.json({ error: 'Logout failed' }, 500)
  }
})

/**
 * 验证Token
 */
app.get('/verify', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'No token provided' }, 401)
    }
    
    const token = authHeader.substring(7)
    
    try {
      const decoded = jwt.verify(token, c.env.JWT_SECRET)
      const db = c.get('db')
      const user = await db.getUserById(decoded.userId)
      
      if (!user || user.status !== 'active') {
        return c.json({ error: 'Invalid token' }, 401)
      }
      
      return c.json({
        valid: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      })
      
    } catch (jwtError) {
      return c.json({ error: 'Invalid token' }, 401)
    }
    
  } catch (error) {
    console.error('Token verification error:', error)
    return c.json({ error: 'Verification failed' }, 500)
  }
})

/**
 * 刷新Token
 */
app.post('/refresh', async (c) => {
  try {
    const { refreshToken } = await c.req.json()
    
    if (!refreshToken) {
      return c.json({ error: 'Refresh token required' }, 400)
    }
    
    // 这里可以实现refresh token逻辑
    // 暂时简化处理
    
    return c.json({ error: 'Refresh token not implemented' }, 501)
    
  } catch (error) {
    console.error('Token refresh error:', error)
    return c.json({ error: 'Refresh failed' }, 500)
  }
})

export default app