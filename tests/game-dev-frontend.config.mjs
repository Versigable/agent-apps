import base from '../playwright.config.mjs';
import os from 'node:os';
import path from 'node:path';
import {defineConfig} from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_PREVIEW_PORT || 42891);
export default defineConfig({...base,testDir:'.',workers:2,reporter:[['list']],outputDir:process.env.GAME_DEV_FRONTEND_REGRESSION_ARTIFACTS || path.join(os.tmpdir(),`game-dev-frontend-regression-${process.pid}`),use:{...base.use,extraHTTPHeaders:{Origin:`http://127.0.0.1:${port}`},baseURL:`http://127.0.0.1:${port}`},webServer:{command:`KANBAN_MODE=fixture PREVIEW_SURFACE=apps PREVIEW_PUBLIC_URL=http://127.0.0.1:${port} PREVIEW_HOST=127.0.0.1 PREVIEW_PORT=${port} node scripts/preview-service.mjs`,cwd:new URL('..',import.meta.url).pathname,url:`http://127.0.0.1:${port}/apps/kanban/`,reuseExistingServer:false,timeout:10000}});
