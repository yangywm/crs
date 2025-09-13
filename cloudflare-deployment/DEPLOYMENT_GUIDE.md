# CRS Cloudflare 部署指南

## 🚀 快速开始

### 1. 前置要求

- **Node.js** 18+ 
- **npm** 或 **yarn**
- **Cloudflare账户** (免费账户即可)
- **Git** (用于克隆代码)

### 2. 一键部署

```bash
# 克隆项目
git clone https://github.com/yangywm/crs.git
cd crs/cloudflare-deployment

# 安装依赖并部署
make install
make deploy
```

就这么简单！脚本会自动：
- 安装所有依赖
- 创建Cloudflare资源
- 配置环境变量
- 部署Workers和Pages
- 初始化数据库

## 📋 详细步骤

### 步骤1: 准备环境

```bash
# 安装Wrangler CLI
npm install -g wrangler

# 登录Cloudflare
wrangler login

# 验证登录状态
wrangler whoami
```

### 步骤2: 创建Cloudflare资源

```bash
# 使用Makefile自动创建
make setup

# 或手动创建
wrangler d1 create crs-database
wrangler kv:namespace create "CRS_CACHE"
wrangler kv:namespace create "CRS_SESSIONS"
wrangler r2 bucket create crs-storage
```

### 步骤3: 配置环境变量

脚本会自动生成配置文件，或者手动配置：

```bash
# Workers环境变量 (workers/.env)
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-32-char-key
API_KEY_PREFIX=cr_

# Pages环境变量 (pages/.env)
VITE_API_BASE_URL=https://your-workers-url
```

### 步骤4: 部署服务

```bash
# 部署Workers API
cd workers
wrangler deploy --env production

# 部署Pages前端
cd ../pages
npm run build
wrangler pages deploy dist
```

### 步骤5: 初始化数据库

```bash
# 运行数据库迁移
wrangler d1 migrations apply crs-database --remote

# 创建管理员用户（自动完成）
```

## 🔧 配置说明

### Workers配置 (wrangler.toml)

```toml
name = "crs-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

# D1数据库
[[d1_databases]]
binding = "DB"
database_name = "crs-database"
database_id = "your-database-id"

# KV存储
[[kv_namespaces]]
binding = "CACHE"
id = "your-cache-kv-id"

# R2存储
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "crs-storage"
```

### 环境变量说明

| 变量名 | 说明 | 必需 |
|--------|------|------|
| JWT_SECRET | JWT签名密钥 | ✅ |
| ENCRYPTION_KEY | 数据加密密钥 | ✅ |
| API_KEY_PREFIX | API密钥前缀 | ❌ |
| CLAUDE_API_URL | Claude API地址 | ❌ |
| LOG_LEVEL | 日志级别 | ❌ |

## 🌐 自定义域名

### 1. 添加域名到Cloudflare

```bash
# 在Cloudflare Dashboard添加域名
# 或使用API添加
```

### 2. 配置Workers路由

```bash
# 为API配置路由
wrangler route add "api.yourdomain.com/*" crs-api

# 为Pages配置域名
wrangler pages domain add yourdomain.com --project-name crs-pages
```

### 3. 更新DNS记录

在Cloudflare Dashboard中添加CNAME记录：
- `api.yourdomain.com` → `crs-api.your-subdomain.workers.dev`
- `yourdomain.com` → `crs-pages.pages.dev`

## 📊 监控和维护

### 查看部署状态

```bash
make status
```

### 查看日志

```bash
# Workers日志
make logs

# 或直接使用wrangler
cd workers && wrangler tail
```

### 更新部署

```bash
# 更新代码
git pull origin main

# 重新部署
make deploy
```

### 备份数据

```bash
# 导出D1数据
wrangler d1 export crs-database --output backup.sql

# 备份配置
make backup
```

## 🔒 安全配置

### 1. 环境变量安全

- 使用`wrangler secret`管理敏感信息
- 不要在代码中硬编码密钥
- 定期轮换密钥

```bash
# 设置敏感环境变量
echo "your-secret" | wrangler secret put JWT_SECRET
```

### 2. 访问控制

- 配置Cloudflare Access规则
- 启用Bot管理
- 设置速率限制

### 3. 监控告警

- 配置Cloudflare Analytics
- 设置异常告警
- 监控资源使用

## 🚨 故障排除

### 常见问题

**1. 部署失败**
```bash
# 检查认证状态
wrangler whoami

# 检查配置文件
wrangler config list
```

**2. 数据库连接失败**
```bash
# 检查D1数据库
wrangler d1 list

# 测试数据库连接
wrangler d1 execute crs-database --command "SELECT 1"
```

**3. KV存储问题**
```bash
# 检查KV命名空间
wrangler kv:namespace list

# 测试KV操作
wrangler kv:key put "test" "value" --namespace-id your-kv-id
```

**4. 前端无法访问API**
- 检查CORS配置
- 验证API URL设置
- 查看浏览器控制台错误

### 调试模式

```bash
# 启用调试日志
export DEBUG=true

# 本地开发模式
make dev
```

### 获取帮助

- 查看Cloudflare文档
- 检查GitHub Issues
- 联系技术支持

## 📈 性能优化

### 1. 缓存策略

- 合理设置KV TTL
- 使用Cloudflare Cache API
- 优化数据库查询

### 2. 资源优化

- 压缩静态资源
- 使用CDN加速
- 优化图片资源

### 3. 监控指标

- 响应时间
- 错误率
- 资源使用率
- 用户体验指标

## 🔄 CI/CD集成

### GitHub Actions

项目包含完整的GitHub Actions配置：

- 自动代码检查
- 自动部署到开发/生产环境
- 安全扫描
- 性能测试

### 手动触发部署

```bash
# 通过GitHub Actions手动部署
gh workflow run deploy.yml
```

## 💰 成本优化

### 免费额度

- Workers: 100k请求/天
- Pages: 无限制
- D1: 5GB存储
- KV: 1GB存储
- R2: 10GB存储

### 成本监控

```bash
# 查看使用统计
make monitor

# 设置预算告警
# 在Cloudflare Dashboard配置
```

## 🎯 最佳实践

1. **安全第一**: 定期更新密钥，启用所有安全功能
2. **监控为王**: 设置完善的监控和告警
3. **备份重要**: 定期备份数据和配置
4. **测试优先**: 在开发环境充分测试
5. **文档同步**: 保持文档和代码同步更新

## 📚 相关资源

- [Cloudflare Workers文档](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages文档](https://developers.cloudflare.com/pages/)
- [Cloudflare D1文档](https://developers.cloudflare.com/d1/)
- [Wrangler CLI文档](https://developers.cloudflare.com/workers/wrangler/)
- [CRS项目文档](../README.md)