// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/).
import { Actor } from 'apify';
// Web scraping and browser automation library (Read more at https://crawlee.dev)
import type { Request } from 'crawlee';
import { PuppeteerCrawler } from 'crawlee';

import { router } from './routes.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init().
await Actor.init();

interface Input {
    companyIds: string[];
}
// Define the URLs to start the crawler with - get them from the input of the Actor or use a default list.
const { companyIds = ['4821421'] } = (await Actor.getInput<Input>()) ?? {};

const startUrls = companyIds.map((id) => ({
    url: `https://www.linkedin.com/company/${id}/jobs/`,
    label: 'jobs',
}));

// Create a proxy configuration that will rotate proxies from Apify Proxy.
const proxyConfiguration = await Actor.createProxyConfiguration();

// Create a PuppeteerCrawler that will use the proxy configuration and and handle requests with the router from routes.ts file.
const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    headless: false,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: [
                '--disable-gpu', // Mitigates the "crashing GPU process" issue in Docker containers
                '--no-sandbox', // Mitigates the "sandboxed" process issue in Docker containers
            ],
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
});

// Run the crawler with the start URLs and wait for it to finish.
await crawler.run(startUrls);

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit().
await Actor.exit();
