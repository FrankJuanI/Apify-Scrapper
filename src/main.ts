import { Actor } from 'apify';
import { PuppeteerCrawler, RequestQueue, AutoscaledPool } from 'crawlee';
import { router } from './routes.js';

await Actor.init();

interface Input {
    companyIds: string[];
}
const {
    companyIds = ['4821421', '23852', '25192'],
} = (await Actor.getInput<Input>()) ?? {};

const requestQueue = await RequestQueue.open('linkedin-company-jobs-queue');

// Encolar solo nuevos requests para evitar duplicados
for (const id of companyIds) {
    await requestQueue.addRequest({
        url: `https://www.linkedin.com/company/${id}/jobs/`,
        userData: { label: 'jobs', companyId: id },
        uniqueKey: id, // evita duplicados en queue
    });
}

// Configuración proxy con sesiones para evitar bloqueos LinkedIn
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['SHADER', 'RESIDENTIAL']
});

const crawler = new PuppeteerCrawler({
    requestQueue,
    proxyConfiguration,
    maxRequestRetries: 5,
    sessionPoolOptions: {
        maxPoolSize: 50, // máximo de sesiones para rotar (ajustar según tu cuenta)
    },
    requestHandlerTimeoutSecs: 240,
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--disable-gpu', '--no-sandbox'],
        },
    },
    preNavigationHooks: [
        async ({ page }) => {
            await page.setCookie({
                name: 'li_at',
                value: 'AQEDAUMp89QFwYJEAAABkVYU_PMAAAGXodDYnlYAK96UO9Ho4lsqk_q8btWWBulxVPMALuRnB39cfJHmB9odxU26fdYAE9ZQatpLyPxHOfFeFw_gZ-XHe4ZUYO-wVr-NdsRnA2nZkYqe9k5auzuNVvRK',
                domain: '.linkedin.com',
            });
        },
    ],
    requestHandler: router,
    failedRequestHandler: async ({ request, error, log }) => {
        log.error(`Request ${request.url} failed after retries: ${error.message}`);
    },
});

// Pool con autoescalado para controlar concurrencia según recursos
const pool = new AutoscaledPool({
    runTaskFunction: (request) => crawler.runTask(request),
    maxConcurrency: 20,          // máximo absoluto concurrente (ajustar)
    desiredConcurrency: 10,      // concurrencia objetivo inicial
    systemStatusOptions: {
        memoryAvailableBytes: 300 * 1024 * 1024, // 300MB mínimo memoria disponible para aumentar concurrencia
    },
});

await pool.run();
await Actor.exit();
