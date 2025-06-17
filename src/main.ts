import { Actor } from 'apify';
import { PuppeteerCrawler, RequestQueue } from 'crawlee';
import { router } from './routes.js';

await Actor.init();

interface Input {
    companyIds: string[];
}
const {
    companyIds = ['4821421', '23852', '25192'],
} = (await Actor.getInput<Input>()) ?? {};

// Creamos la cola de requests
const requestQueue = await RequestQueue.open('linkedin-company-jobs-queue');

// Encolamos todas las companyIds
for (const id of companyIds) {
    await requestQueue.addRequest({
        url: `https://www.linkedin.com/company/${id}/jobs/`,
        userData: { label: 'jobs', companyId: id },
        uniqueKey: id,
    });
}

// Configuración de proxy
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['SHADER', 'RESIDENTIAL'],
});

// Crawler configurado
const crawler = new PuppeteerCrawler({
    requestQueue,
    proxyConfiguration,
    sessionPoolOptions: {
        maxPoolSize: 50,
        sessionOptions: {
            maxUsageCount: 12, // cada sesión se usa hasta 12 veces
        },
    },
    useSessionPool: true,
    maxConcurrency: 5,
    maxRequestRetries: 2,
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
        log.error(`❌ Falló ${request.url} tras múltiples reintentos: ${error}`);
    },
});

// 🧠 Ejecutamos el crawler y él maneja el autoscaledPool internamente
await crawler.run();

await Actor.exit();
