import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const resolveMapsDir = () => {
  const root = process.cwd()
  const envDir = process.env.PGM_DIR
  if (envDir) {
    const resolved = path.resolve(root, envDir)
    return resolved
  }
  return path.resolve(root, 'maps')
}

const MAPS_DIR = resolveMapsDir()

const ensureMapsDir = async () => {
  try {
    await fsp.mkdir(MAPS_DIR, { recursive: true })
  } catch (error) {
    console.warn('[maps] Unable to ensure maps directory:', error)
  }
}

const sendJson = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

const sanitizeName = (name) => path.basename(name).replace(/\\/g, '')

const collectBody = async (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const registerMapsApi = (server) => {
  server.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/api/maps')) {
      next()
      return
    }

    await ensureMapsDir()

    const url = new URL(req.url, 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean) // ['api', 'maps', 'filename?']

    if (parts.length === 2 && req.method === 'GET') {
      try {
        const files = await fsp.readdir(MAPS_DIR, { withFileTypes: true })
        const pgmFiles = files
          .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pgm'))
          .map((entry) => {
            const stat = fs.statSync(path.join(MAPS_DIR, entry.name))
            return {
              name: entry.name,
              size: stat.size,
              mtime: stat.mtimeMs
            }
          })
          .sort((a, b) => b.mtime - a.mtime)
        sendJson(res, 200, pgmFiles)
      } catch (error) {
        console.error('[maps] list error:', error)
        sendJson(res, 500, { message: '无法读取地图目录' })
      }
      return
    }

    if (parts.length === 3) {
      const rawName = decodeURIComponent(parts[2] || '')
      const safeName = sanitizeName(rawName)
      const targetPath = path.join(MAPS_DIR, safeName)

      if (req.method === 'GET') {
        try {
          await fsp.access(targetPath, fs.constants.R_OK)
          res.statusCode = 200
          res.setHeader('Content-Type', 'image/x-portable-graymap')
          const stream = fs.createReadStream(targetPath)
          stream.pipe(res)
        } catch (error) {
          console.error('[maps] read error:', error)
          sendJson(res, 404, { message: '地图文件不存在' })
        }
        return
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        try {
          if (!safeName.toLowerCase().endsWith('.pgm')) {
            sendJson(res, 400, { message: '文件名必须以 .pgm 结尾' })
            return
          }
          const body = await collectBody(req)
          await fsp.writeFile(targetPath, body)
          res.statusCode = 204
          res.end()
        } catch (error) {
          console.error('[maps] write error:', error)
          sendJson(res, 500, { message: '保存地图失败' })
        }
        return
      }
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 200
      res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.end()
      return
    }

    next()
  })
}

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'map-directory-middleware',
      configureServer(server) {
        registerMapsApi(server)
      }
    }
  ]
})
