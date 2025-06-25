import { Actor } from 'apify';
import { PuppeteerCrawler, RequestQueue } from 'crawlee';
import { router } from './routes.js';

await Actor.init();

interface Input {
    companyIds: string[];
}
const { companyIds } = (await Actor.getInput<Input>()) ?? {};

if (!companyIds || companyIds.length === 0) {
    throw new Error('No companyIds provided');
}

// Creamos la cola de requests
const requestQueue = await RequestQueue.open('linkedin-company-jobs-queue');

// Encolamos todas las companyIds
for (const id of companyIds) {
    await requestQueue.addRequest({
        url: `https://www.linkedin.com/company/${id}/jobs/`,
        userData: { label: 'jobs', companyId: id },
        uniqueKey: id.toString(),
    });
}

// Configuración de proxy
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
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
    maxConcurrency: 1,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 240,
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--disable-gpu', '--no-sandbox'],
        },
        useChrome: true
    },
    persistCookiesPerSession: true,
    preNavigationHooks: [
        async ({ page }) => {
            await page.setCookie({
                name: 'li_at',
                value: 'AQEDAVwjFs8EwJcBAAABl6iceiMAAAGXzKj-I00AfIMRUdgCohAv9kJQH4vGSGTiHsQ-DYZfk70gzRCzGZkRROrm9QzqoJbzrLYpYfOfxHu6R6x2ay4vUPgzNFM7SDIXZ3muJKmiIhxUt1Fnq5VKR263',
                domain: '.linkedin.com',
            });
        },
    ],
    postNavigationHooks: [
        async () => {
          await new Promise(res => setTimeout(res, 5000 + Math.random() * 3000));
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
