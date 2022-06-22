import chokidar from 'chokidar'
import { resolve } from 'path'
import { Options } from '../types'
import { createPrefixTree } from './tree'
import { promises as fs } from 'fs'
import { logTree, throttle } from './utils'
import { generateRouteNamedMap } from './generateRouteMap'

export function createRoutesContext(options: Required<Options>) {
  const { dts: preferDTS, root } = options
  const dts =
    preferDTS === false
      ? false
      : preferDTS === true
      ? resolve(root, 'typed-router.d.ts')
      : resolve(root, preferDTS)

  const routeTree = createPrefixTree()

  const resolvedRoutesFolder = resolve(root, options.routesFolder)
  const serverWatcher = chokidar.watch(resolvedRoutesFolder, {
    // TODO: create a scanRouteFolders() function that also works for build
    // ignoreInitial: true,
    disableGlobbing: true,
    ignorePermissionErrors: true,
    // useFsEvents: true,
    // TODO: allow user options
  })

  function stripRouteFolder(path: string) {
    return path.slice(resolvedRoutesFolder.length + 1)
  }

  function setupWatcher() {
    serverWatcher
      .on('change', (path) => {
        // TODO: parse defineRoute macro?
        console.log('change', path)
        writeConfigFiles()
      })
      .on('add', (path) => {
        console.log('added', path)
        routeTree.insert(
          stripRouteFolder(path),
          // './' + path
          resolve(root, path)
        )
        writeConfigFiles()
      })
      .on('unlink', (path) => {
        console.log('remove', path)
        routeTree.remove(stripRouteFolder(path))
        writeConfigFiles()
      })
  }

  function stop() {
    serverWatcher.close()
  }

  function generateRoutes() {
    return `export const routes = ${routeTree.toRouteRecordString()}`
  }

  function generateDTS(): string {
    return `
// Generated by unplugin-vue-router. ‼️ DO NOT MODIFY THIS FILE ‼️
// It's recommended to commit this file.
// Make sure to add this file to your tsconfig.json file as an "includes" or "files" entry.

/// <reference types="unplugin-vue-router/client" />

import type { RouteRecordInfo } from 'unplugin-vue-router'

declare module '~routes' {
${generateRouteNamedMap(routeTree)
  .split('\n')
  .filter((line) => line)
  .map((line) => line.padStart(2))
  .join('\n')}
}

`
  }

  let lastDTS: string | undefined
  async function _writeConfigFiles() {
    console.log('writing')
    logTree(routeTree)
    if (dts) {
      const content = generateDTS()
      if (lastDTS !== content) {
        await fs.writeFile(dts, content, 'utf-8')
        lastDTS = content
      }
    }
  }
  const writeConfigFiles = throttle(_writeConfigFiles, 500)

  setupWatcher()

  return {
    stop,
    writeConfigFiles,

    generateRoutes,
  }
}
