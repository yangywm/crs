#!/bin/bash

# CRS Cloudflare 部署脚本
# 自动化部署到Cloudflare平台

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI 未安装，请运行: npm install -g wrangler"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm 未安装"
        exit 1
    fi
    
    log_success "依赖检查完成"
}

# 检查Cloudflare登录状态
check_auth() {
    log_info "检查Cloudflare认证状态..."
    
    if ! wrangler whoami &> /dev/null; then
        log_warning "未登录Cloudflare，请先登录"
        wrangler login
    fi
    
    log_success "Cloudflare认证检查完成"
}

# 创建Cloudflare资源
create_resources() {
    log_info "创建Cloudflare资源..."
    
    # 创建D1数据库
    log_info "创建D1数据库..."
    if ! wrangler d1 list | grep -q "crs-database"; then
        wrangler d1 create crs-database
        log_success "D1数据库创建完成"
    else
        log_info "D1数据库已存在"
    fi
    
    # 创建KV命名空间
    log_info "创建KV命名空间..."
    if ! wrangler kv:namespace list | grep -q "CRS_CACHE"; then
        wrangler kv:namespace create "CRS_CACHE"
        log_success "缓存KV命名空间创建完成"
    else
        log_info "缓存KV命名空间已存在"
    fi
    
    if ! wrangler kv:namespace list | grep -q "CRS_SESSIONS"; then
        wrangler kv:namespace create "CRS_SESSIONS"
        log_success "会话KV命名空间创建完成"
    else
        log_info "会话KV命名空间已存在"
    fi
    
    # 创建R2存储桶
    log_info "创建R2存储桶..."
    if ! wrangler r2 bucket list | grep -q "crs-storage"; then
        wrangler r2 bucket create crs-storage
        log_success "R2存储桶创建完成"
    else
        log_info "R2存储桶已存在"
    fi
}

# 配置环境变量
configure_env() {
    log_info "配置环境变量..."
    
    # 检查是否存在.env文件
    if [ ! -f "workers/.env" ]; then
        log_info "创建Workers环境变量文件..."
        cat > workers/.env << EOF
# Cloudflare Workers环境变量
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32 | cut -c1-32)
API_KEY_PREFIX=cr_
NODE_ENV=production
LOG_LEVEL=info
CLAUDE_API_URL=https://api.anthropic.com/v1/messages
CLAUDE_API_VERSION=2023-06-01
CLAUDE_BETA_HEADER=claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14
DEFAULT_TOKEN_LIMIT=1000000
WEB_TITLE=Claude Relay Service
EOF
        log_success "Workers环境变量文件创建完成"
    fi
    
    if [ ! -f "pages/.env" ]; then
        log_info "创建Pages环境变量文件..."
        cat > pages/.env << EOF
# Cloudflare Pages环境变量
VITE_API_BASE_URL=https://crs-api.your-subdomain.workers.dev
VITE_APP_TITLE=Claude Relay Service
VITE_APP_VERSION=1.0.0
EOF
        log_success "Pages环境变量文件创建完成"
    fi
}

# 部署Workers
deploy_workers() {
    log_info "部署Workers API服务..."
    
    cd workers
    
    # 安装依赖
    log_info "安装Workers依赖..."
    npm install
    
    # 运行数据库迁移
    log_info "运行数据库迁移..."
    wrangler d1 migrations apply crs-database --remote
    
    # 部署到生产环境
    log_info "部署Workers到生产环境..."
    wrangler deploy --env production
    
    cd ..
    
    log_success "Workers部署完成"
}

# 部署Pages
deploy_pages() {
    log_info "部署Pages前端..."
    
    cd pages
    
    # 复制原项目的前端代码
    if [ -d "../../web/admin-spa/src" ]; then
        log_info "复制前端源代码..."
        cp -r ../../web/admin-spa/src ./
        cp -r ../../web/admin-spa/components ./
        cp ../../web/admin-spa/index.html ./
        cp ../../web/admin-spa/tailwind.config.js ./
        cp ../../web/admin-spa/postcss.config.js ./
    fi
    
    # 安装依赖
    log_info "安装Pages依赖..."
    npm install
    
    # 构建项目
    log_info "构建前端项目..."
    npm run build
    
    # 部署到Pages
    log_info "部署到Cloudflare Pages..."
    wrangler pages deploy dist --project-name crs-pages
    
    cd ..
    
    log_success "Pages部署完成"
}

# 配置自定义域名
configure_domain() {
    local domain=$1
    
    if [ -n "$domain" ]; then
        log_info "配置自定义域名: $domain"
        
        # 为Workers配置域名
        log_info "为Workers API配置域名..."
        wrangler route add "$domain/api/*" crs-api --env production
        wrangler route add "$domain/admin/*" crs-api --env production
        wrangler route add "$domain/claude/*" crs-api --env production
        wrangler route add "$domain/gemini/*" crs-api --env production
        wrangler route add "$domain/openai/*" crs-api --env production
        
        # 为Pages配置域名
        log_info "为Pages配置域名..."
        wrangler pages domain add "$domain" --project-name crs-pages
        
        log_success "域名配置完成"
    fi
}

# 验证部署
verify_deployment() {
    log_info "验证部署状态..."
    
    # 检查Workers状态
    log_info "检查Workers状态..."
    local workers_url=$(wrangler whoami | grep "Account ID" | awk '{print $3}')
    if [ -n "$workers_url" ]; then
        log_success "Workers部署成功"
    fi
    
    # 检查Pages状态
    log_info "检查Pages状态..."
    if wrangler pages project list | grep -q "crs-pages"; then
        log_success "Pages部署成功"
    fi
    
    log_success "部署验证完成"
}

# 显示部署信息
show_deployment_info() {
    log_success "🎉 CRS Cloudflare部署完成！"
    echo
    echo "📋 部署信息："
    echo "  Workers API: https://crs-api.your-subdomain.workers.dev"
    echo "  Pages前端:   https://crs-pages.pages.dev"
    echo
    echo "🔧 下一步操作："
    echo "  1. 访问前端管理界面"
    echo "  2. 使用默认管理员账号登录"
    echo "  3. 添加Claude账户"
    echo "  4. 创建API Keys"
    echo "  5. 配置自定义域名（可选）"
    echo
    echo "📚 更多信息请查看: cloudflare-deployment/README.md"
}

# 主函数
main() {
    echo "🚀 开始部署CRS到Cloudflare平台"
    echo
    
    # 解析命令行参数
    DOMAIN=""
    SKIP_RESOURCES=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                DOMAIN="$2"
                shift 2
                ;;
            --skip-resources)
                SKIP_RESOURCES=true
                shift
                ;;
            --help)
                echo "用法: $0 [选项]"
                echo "选项:"
                echo "  --domain DOMAIN      配置自定义域名"
                echo "  --skip-resources     跳过资源创建（如果已存在）"
                echo "  --help              显示帮助信息"
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                exit 1
                ;;
        esac
    done
    
    # 执行部署步骤
    check_dependencies
    check_auth
    
    if [ "$SKIP_RESOURCES" = false ]; then
        create_resources
    fi
    
    configure_env
    deploy_workers
    deploy_pages
    
    if [ -n "$DOMAIN" ]; then
        configure_domain "$DOMAIN"
    fi
    
    verify_deployment
    show_deployment_info
}

# 错误处理
trap 'log_error "部署过程中发生错误，请检查日志"; exit 1' ERR

# 运行主函数
main "$@"