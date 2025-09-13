# CRS Cloudflare 部署 Makefile
# 提供便捷的部署和管理命令

.PHONY: help install deploy dev clean migrate test lint format

# 默认目标
help:
	@echo "CRS Cloudflare 部署工具"
	@echo ""
	@echo "可用命令:"
	@echo "  install     安装依赖和初始化环境"
	@echo "  setup       配置Cloudflare资源和环境变量"
	@echo "  deploy      部署到Cloudflare平台"
	@echo "  dev         启动本地开发环境"
	@echo "  migrate     运行数据迁移"
	@echo "  test        运行测试"
	@echo "  lint        代码检查"
	@echo "  format      代码格式化"
	@echo "  clean       清理临时文件"
	@echo "  logs        查看部署日志"
	@echo "  status      检查部署状态"

# 安装依赖
install:
	@echo "📦 安装依赖..."
	@if ! command -v wrangler >/dev/null 2>&1; then \
		echo "安装 Wrangler CLI..."; \
		npm install -g wrangler; \
	fi
	@if ! command -v jq >/dev/null 2>&1; then \
		echo "请安装 jq: apt-get install jq 或 brew install jq"; \
		exit 1; \
	fi
	cd workers && npm install
	cd pages && npm install
	@echo "✅ 依赖安装完成"

# 配置环境
setup: install
	@echo "⚙️ 配置Cloudflare环境..."
	chmod +x scripts/setup-env.sh
	./scripts/setup-env.sh
	@echo "✅ 环境配置完成"

# 部署到生产环境
deploy: setup
	@echo "🚀 部署到Cloudflare..."
	chmod +x deploy.sh
	./deploy.sh
	@echo "✅ 部署完成"

# 部署到开发环境
deploy-dev:
	@echo "🚀 部署到开发环境..."
	cd workers && wrangler deploy --env development
	cd pages && wrangler pages deploy dist --project-name crs-pages-dev
	@echo "✅ 开发环境部署完成"

# 本地开发环境
dev:
	@echo "🛠️ 启动本地开发环境..."
	docker-compose -f docker-compose.dev.yml up -d
	@echo "✅ 开发环境已启动"
	@echo "Workers: http://localhost:8787"
	@echo "Pages: http://localhost:3001"
	@echo "SQLite Web: http://localhost:8080"

# 停止开发环境
dev-stop:
	@echo "🛑 停止开发环境..."
	docker-compose -f docker-compose.dev.yml down
	@echo "✅ 开发环境已停止"

# 数据迁移
migrate:
	@echo "🔄 运行数据迁移..."
	@if [ -f "../.env" ]; then \
		echo "检测到现有Redis配置，开始迁移..."; \
		node scripts/migrate-data.js; \
	else \
		echo "未检测到现有配置，跳过迁移"; \
	fi
	cd workers && wrangler d1 migrations apply crs-database --remote
	@echo "✅ 数据迁移完成"

# 运行测试
test:
	@echo "🧪 运行测试..."
	cd workers && npm test
	cd pages && npm test
	@echo "✅ 测试完成"

# 代码检查
lint:
	@echo "🔍 代码检查..."
	cd workers && npm run lint
	cd pages && npm run lint
	@echo "✅ 代码检查完成"

# 代码格式化
format:
	@echo "✨ 代码格式化..."
	cd workers && npm run format
	cd pages && npm run format
	@echo "✅ 代码格式化完成"

# 清理临时文件
clean:
	@echo "🧹 清理临时文件..."
	rm -rf workers/node_modules
	rm -rf pages/node_modules
	rm -rf pages/dist
	rm -rf migration-data
	rm -rf dev-data
	docker-compose -f docker-compose.dev.yml down -v
	@echo "✅ 清理完成"

# 查看部署日志
logs:
	@echo "📋 查看Workers日志..."
	cd workers && wrangler tail

# 检查部署状态
status:
	@echo "📊 检查部署状态..."
	@echo "Workers状态:"
	cd workers && wrangler status
	@echo ""
	@echo "Pages状态:"
	cd pages && wrangler pages project list
	@echo ""
	@echo "D1数据库:"
	wrangler d1 list
	@echo ""
	@echo "KV命名空间:"
	wrangler kv:namespace list
	@echo ""
	@echo "R2存储桶:"
	wrangler r2 bucket list

# 更新到最新版本
update:
	@echo "🔄 更新到最新版本..."
	git pull origin main
	cd workers && npm update
	cd pages && npm update
	@echo "✅ 更新完成"

# 备份配置
backup:
	@echo "💾 备份配置..."
	mkdir -p backups/$(shell date +%Y%m%d_%H%M%S)
	cp -r workers/wrangler.toml backups/$(shell date +%Y%m%d_%H%M%S)/
	cp -r workers/.env backups/$(shell date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
	cp -r pages/.env backups/$(shell date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
	@echo "✅ 配置已备份到 backups/"

# 恢复配置
restore:
	@echo "📥 恢复配置..."
	@echo "可用备份:"
	@ls -la backups/
	@echo "请手动选择要恢复的备份目录"

# 监控资源使用
monitor:
	@echo "📈 监控资源使用..."
	@echo "Workers请求统计:"
	cd workers && wrangler analytics
	@echo ""
	@echo "Pages访问统计:"
	cd pages && wrangler pages analytics

# 安全检查
security:
	@echo "🔒 安全检查..."
	@echo "检查敏感信息泄露..."
	@if grep -r "sk-" workers/ pages/ 2>/dev/null; then \
		echo "⚠️ 发现可能的API密钥泄露"; \
	else \
		echo "✅ 未发现敏感信息泄露"; \
	fi
	@echo "检查配置文件权限..."
	@find . -name "*.env" -exec ls -la {} \;

# 性能测试
benchmark:
	@echo "⚡ 性能测试..."
	@if command -v ab >/dev/null 2>&1; then \
		echo "运行Apache Bench测试..."; \
		ab -n 100 -c 10 https://crs-api.your-subdomain.workers.dev/health; \
	else \
		echo "请安装 apache2-utils 来运行性能测试"; \
	fi