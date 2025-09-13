import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './style.css'

import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import Users from './views/Users.vue'
import ApiKeys from './views/ApiKeys.vue'
import Accounts from './views/Accounts.vue'
import Settings from './views/Settings.vue'
import Login from './views/Login.vue'

// 路由配置
const routes = [
  { path: '/login', component: Login, name: 'Login' },
  { 
    path: '/', 
    component: App,
    redirect: '/dashboard',
    children: [
      { path: '/dashboard', component: Dashboard, name: 'Dashboard' },
      { path: '/users', component: Users, name: 'Users' },
      { path: '/api-keys', component: ApiKeys, name: 'ApiKeys' },
      { path: '/accounts', component: Accounts, name: 'Accounts' },
      { path: '/settings', component: Settings, name: 'Settings' }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  
  if (to.name !== 'Login' && !token) {
    next({ name: 'Login' })
  } else if (to.name === 'Login' && token) {
    next({ name: 'Dashboard' })
  } else {
    next()
  }
})

const app = createApp(App)
const pinia = createPinia()

app.use(router)
app.use(pinia)
app.use(ElementPlus)

app.mount('#app')