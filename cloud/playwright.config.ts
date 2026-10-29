import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',workers:1,use:{baseURL:'http://127.0.0.1:3001',channel:process.env.OSKA_BROWSER_CHANNEL||undefined,headless:true,trace:'retain-on-failure'},outputDir:'../test-results/cloud'});
