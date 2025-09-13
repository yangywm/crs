# CRS Cloudflare 部署方案

## 架构概览

本方案将CRS项目部署到Cloudflare平台，充分利用其全球边缘网络和服务：

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Cloudflare     │    │   Cloudflare     │    │   Cloudflare    │
│     Pages       │    │    Workers       │    │       R2        │
│  (前端静态资源)   │    │   (API服务)      │    │   (文件存储)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌──────────────────┐
                    │   Cloudflare     │
                    │      D1          │
                    │   (数据库)       │
                    └──────────────────┘
```

### 组件分工

1. **Cloudflare Pages**: 托管Vue.js前端管理界面
2. **Cloudflare Workers**: 运行Node.js API服务（使用Hono框架）
3. **Cloudflare D1**: 替代Redis作为主数据库
4. **Cloudflare R2**: 存储日志文件和数据备份
5. **Cloudflare KV**: 缓存和会话存储

## 部署步骤

### 1. 准备工作

```bash
# 安装Wrangler CLI
npm install -g wrangler

# 登录Cloudflare
wrangler login

# 克隆项目
git clone https://github.com/yangywm/crs.git
cd crs
```

### 2. 创建Cloudflare资源

```bash
# 创建D1数据库
wrangler d1 create crs-database

# 创建KV命名空间
wrangler kv:namespace create "CRS_CACHE"
wrangler kv:namespace create "CRS_SESSIONS"

# 创建R2存储桶
wrangler r2 bucket create crs-storage
```

### 3. 部署Workers API

参考 `workers/` 目录下的配置文件。

### 4. 部署Pages前端

参考 `pages/` 目录下的配置文件。

## 优势

### 性能优势
- **全球CDN**: 前端资源通过Cloudflare全球网络分发
- **边缘计算**: API请求在离用户最近的边缘节点处理
- **零冷启动**: Workers保持热启动状态

### 成本优势
- **免费额度**: 大部分功能在免费额度内使用
- **按需付费**: 只为实际使用的资源付费
- **无服务器**: 无需维护服务器基础设施

### 可靠性优势
- **99.9%+ SLA**: Cloudflare提供企业级可靠性
- **自动扩缩容**: 根据流量自动调整资源
- **内置DDoS防护**: 免费的安全防护

## 成本估算

基于中小型团队使用（月请求量 < 100万）：

| 服务 | 免费额度 | 超出费用 | 预估月费用 |
|------|----------|----------|------------|
| Pages | 无限制 | $0 | $0 |
| Workers | 100k请求/天 | $0.50/百万请求 | $0-5 |
| D1 | 5GB存储 | $0.75/GB | $0-2 |
| R2 | 10GB存储 | $0.015/GB | $0-1 |
| KV | 1GB存储 | $0.50/GB | $0-1 |

**总计**: $0-9/月（相比传统VPS节省80%+）

## 迁移指南

### 从传统部署迁移

1. **数据导出**: 使用现有的数据导出功能
2. **配置转换**: 将环境变量转换为Workers配置
3. **逐步迁移**: 先迁移前端，再迁移API
4. **DNS切换**: 最后切换DNS指向

### 回滚方案

- 保留原有部署作为备份
- 使用Cloudflare流量分割进行灰度发布
- 快速DNS切换回原有服务

## 监控和维护

### 内置监控
- Cloudflare Analytics: 流量和性能分析
- Workers Analytics: API调用统计
- Real User Monitoring: 用户体验监控

### 日志管理
- Workers日志自动收集到R2
- 支持实时日志流
- 集成第三方日志分析工具

## 安全特性

### 自动安全防护
- DDoS防护
- Bot管理
- WAF规则
- SSL/TLS加密

### 访问控制
- IP白名单/黑名单
- 地理位置限制
- 速率限制
- API密钥验证

## 开发工作流

### 本地开发
```bash
# 启动本地开发环境
wrangler dev

# 运行前端开发服务器
cd web/admin-spa && npm run dev
```

### 部署流程
```bash
# 部署Workers
wrangler deploy

# 部署Pages（通过Git集成自动部署）
git push origin main
```

## 故障排除

### 常见问题
1. **Workers超时**: 调整超时设置或优化代码
2. **D1连接限制**: 使用连接池管理
3. **KV延迟**: 合理设计缓存策略

### 调试工具
- Wrangler CLI调试
- Cloudflare Dashboard监控
- 实时日志查看

## 下一步

1. 查看 `workers/` 目录了解API服务配置
2. 查看 `pages/` 目录了解前端部署配置
3. 查看 `database/` 目录了解数据库迁移脚本
4. 运行部署脚本开始迁移