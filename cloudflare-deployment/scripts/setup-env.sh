#!/bin/bash

# 环境配置脚本
# 自动配置Cloudflare部署所需的环境变量和资源ID

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# 获取资源ID
get_resource_ids() {
    log_info "获取Cloudflare资源ID..."
    
    # 获取D1数据库ID
    local db_id=$(wrangler d1 list | grep "crs-database" | awk '{print $2}')
    if [ -z "$db_id" ]; then
        log_error "未找到D1数据库，请先运行部署脚本"
        exit 1
    fi
    
    # 获取KV命名空间ID
    local cache_kv_id=$(wrangler kv:namespace list | grep "CRS_CACHE" | jq -r '.id')
    local sessions_kv_id=$(wrangler kv:namespace list | grep "CRS_SESSIONS" | jq -r '.id')
    
    if [ -z "$cache_kv_id" ] || [ -z "$sessions_kv_id" ]; then
        log_error "未找到KV命名空间，请先运行部署脚本"
        exit 1
    fi
    
    # 获取账户ID
    local account_id=$(wrangler whoami | grep "Account ID" | awk '{print $3}')
    
    echo "DATABASE_ID=$db_id"
    echo "CACHE_KV_ID=$cache_kv_id"
    echo "SESSIONS_KV_ID=$sessions_kv_id"
    echo "ACCOUNT_ID=$account_id"
}

# 更新wrangler.toml配置
update_wrangler_config() {
    local db_id=$1
    local cache_kv_id=$2
    local sessions_kv_id=$3
    
    log_info "更新wrangler.toml配置..."
    
    # 更新Workers配置
    sed -i.bak "s/database_id = \"your-database-id\"/database_id = \"$db_id\"/" workers/wrangler.toml
    sed -i.bak "s/database_id = \"your-dev-database-id\"/database_id = \"$db_id\"/" workers/wrangler.toml
    sed -i.bak "s/id = \"your-cache-kv-id\"/id = \"$cache_kv_id\"/" workers/wrangler.toml
    sed -i.bak "s/id = \"your-dev-cache-kv-id\"/id = \"$cache_kv_id\"/" workers/wrangler.toml
    sed -i.bak "s/id = \"your-sessions-kv-id\"/id = \"$sessions_kv_id\"/" workers/wrangler.toml
    sed -i.bak "s/id = \"your-dev-sessions-kv-id\"/id = \"$sessions_kv_id\"/" workers/wrangler.toml
    
    # 删除备份文件
    rm -f workers/wrangler.toml.bak
    
    log_success "wrangler.toml配置更新完成"
}

# 生成安全密钥
generate_secrets() {
    log_info "生成安全密钥..."
    
    local jwt_secret=$(openssl rand -base64 32)
    local encryption_key=$(openssl rand -base64 32 | cut -c1-32)
    
    echo "JWT_SECRET=$jwt_secret"
    echo "ENCRYPTION_KEY=$encryption_key"
}

# 创建环境配置文件
create_env_files() {
    local jwt_secret=$1
    local encryption_key=$2
    local workers_url=$3
    
    log_info "创建环境配置文件..."
    
    # Workers环境变量
    cat > workers/.env << EOF
# Cloudflare Workers环境变量
JWT_SECRET=$jwt_secret
ENCRYPTION_KEY=$encryption_key
API_KEY_PREFIX=cr_
NODE_ENV=production
LOG_LEVEL=info
CLAUDE_API_URL=https://api.anthropic.com/v1/messages
CLAUDE_API_VERSION=2023-06-01
CLAUDE_BETA_HEADER=claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14
DEFAULT_TOKEN_LIMIT=1000000
WEB_TITLE=Claude Relay Service
EOF

    # Pages环境变量
    cat > pages/.env << EOF
# Cloudflare Pages环境变量
VITE_API_BASE_URL=$workers_url
VITE_APP_TITLE=Claude Relay Service
VITE_APP_VERSION=1.0.0
VITE_ENABLE_ANALYTICS=false
EOF

    log_success "环境配置文件创建完成"
}

# 设置Wrangler secrets
set_wrangler_secrets() {
    local jwt_secret=$1
    local encryption_key=$2
    
    log_info "设置Wrangler secrets..."
    
    cd workers
    
    echo "$jwt_secret" | wrangler secret put JWT_SECRET --env production
    echo "$encryption_key" | wrangler secret put ENCRYPTION_KEY --env production
    
    cd ..
    
    log_success "Wrangler secrets设置完成"
}

# 初始化数据库
init_database() {
    log_info "初始化数据库..."
    
    cd workers
    
    # 运行迁移
    wrangler d1 migrations apply crs-database --remote
    
    # 创建默认管理员用户
    local admin_password=$(openssl rand -base64 16)
    local admin_password_hash=$(node -e "
        const bcrypt = require('bcryptjs');
        console.log(bcrypt.hashSync('$admin_password', 10));
    ")
    
    # 插入管理员用户
    wrangler d1 execute crs-database --command "
        UPDATE users SET 
            password = '$admin_password_hash',
            updated_at = datetime('now')
        WHERE username = 'admin';
    "
    
    cd ..
    
    echo "ADMIN_PASSWORD=$admin_password" >> .env.local
    
    log_success "数据库初始化完成"
    log_info "默认管理员密码: $admin_password"
}

# 验证配置
verify_config() {
    log_info "验证配置..."
    
    # 检查Workers配置
    if ! grep -q "database_id.*=.*\".*\"" workers/wrangler.toml; then
        log_error "Workers配置验证失败"
        return 1
    fi
    
    # 检查环境文件
    if [ ! -f "workers/.env" ] || [ ! -f "pages/.env" ]; then
        log_error "环境文件验证失败"
        return 1
    fi
    
    log_success "配置验证通过"
}

# 显示配置信息
show_config_info() {
    log_success "🎉 环境配置完成！"
    echo
    echo "📋 配置信息："
    echo "  Workers配置: workers/wrangler.toml"
    echo "  Workers环境: workers/.env"
    echo "  Pages环境:   pages/.env"
    echo "  本地配置:    .env.local"
    echo
    echo "🔑 管理员凭据："
    if [ -f ".env.local" ]; then
        echo "  用户名: admin"
        echo "  密码: $(grep ADMIN_PASSWORD .env.local | cut -d= -f2)"
    fi
    echo
    echo "🚀 下一步："
    echo "  1. 运行 ./deploy.sh 部署服务"
    echo "  2. 或者运行 cd workers && wrangler dev 本地开发"
}

# 主函数
main() {
    echo "⚙️  开始配置CRS Cloudflare环境"
    echo
    
    # 检查依赖
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI未安装"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq未安装，请安装: apt-get install jq 或 brew install jq"
        exit 1
    fi
    
    # 获取资源信息
    local resource_info=$(get_resource_ids)
    local db_id=$(echo "$resource_info" | grep DATABASE_ID | cut -d= -f2)
    local cache_kv_id=$(echo "$resource_info" | grep CACHE_KV_ID | cut -d= -f2)
    local sessions_kv_id=$(echo "$resource_info" | grep SESSIONS_KV_ID | cut -d= -f2)
    local account_id=$(echo "$resource_info" | grep ACCOUNT_ID | cut -d= -f2)
    
    # 生成密钥
    local secrets=$(generate_secrets)
    local jwt_secret=$(echo "$secrets" | grep JWT_SECRET | cut -d= -f2)
    local encryption_key=$(echo "$secrets" | grep ENCRYPTION_KEY | cut -d= -f2)
    
    # 构建Workers URL
    local workers_url="https://crs-api.$account_id.workers.dev"
    
    # 执行配置步骤
    update_wrangler_config "$db_id" "$cache_kv_id" "$sessions_kv_id"
    create_env_files "$jwt_secret" "$encryption_key" "$workers_url"
    set_wrangler_secrets "$jwt_secret" "$encryption_key"
    init_database
    verify_config
    show_config_info
}

# 错误处理
trap 'log_error "配置过程中发生错误"; exit 1' ERR

# 运行主函数
main "$@"