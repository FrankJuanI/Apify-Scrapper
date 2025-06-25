// routes.ts
import { createPuppeteerRouter, Dataset } from 'crawlee';

export const router = createPuppeteerRouter();


router.addDefaultHandler(async ({ page, request, log }) => {
    log.info(`Scraping jobs for companyId: ${request.userData.companyId}`);

    await page.evaluate(() => window.scrollBy(0, 500));

    const verTodosSelector = 'a.org-jobs-recently-posted-jobs-module__show-all-jobs-btn-link';

    try {
        const verTodosButton = await page.waitForSelector(verTodosSelector, { timeout: 5000 });

        if (verTodosButton) {
            log.info('Clicking "Mostrar todos los empleos"...');
            try {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }),
                    verTodosButton.click(),
                ]);
            } catch {
                log.warning('Click worked but no navigation. Content probably loaded via AJAX.');
            }
        }
    } catch {
        log.warning('No "Mostrar todos los empleos" button found or timeout.');
    }

    const allJobs = [];

    while (true) {
        log.info('Scraping jobs on page:', { url: page.url() });

        try {
            await page.waitForSelector('.job-card-container', { timeout: 3000 });
        } catch {
            log.warning('No job results found on page.');
            break;
        }

        await page.evaluate(async () => {
            const scrollContainer = document.querySelector('.scaffold-layout__list > div');
            if (!scrollContainer) return;

            let previousHeight = 0;
            for (let i = 0; i < 10; i++) {
                scrollContainer.scrollBy(0, 500);
                await new Promise(resolve => setTimeout(resolve, 1000));

                const currentHeight = scrollContainer.scrollHeight;
                if (currentHeight === previousHeight) break;
                previousHeight = currentHeight;
            }
        });

        const jobs = await page.evaluate(() =>
            [...document.querySelectorAll('.job-card-container')].map(el => ({
                title: el.querySelector('.job-card-list__title--link')?.textContent?.trim() ?? null,
                company: el.querySelector('.artdeco-entity-lockup__subtitle')?.textContent?.trim() ?? null,
                location: el.querySelector('.job-card-container__metadata-wrapper')?.textContent?.trim() ?? null,
                link: el.querySelector('a')?.href ?? null,
            }))
        );

        allJobs.push(...jobs);

        const nextButtonSelector = '.jobs-search-pagination__button--next';
        const nextButton = await page.$(nextButtonSelector);

        if (nextButton) {
            const firstJobHref = await page.evaluate(() => {
                const el = document.querySelector('.job-card-container a') as HTMLAnchorElement | null;
                return el?.href ?? null;
            });
            log.info('Going to next page...');
            await nextButton.click();

            try {
                await page.waitForFunction(
                    (href) => {
                        const el = document.querySelector('.job-card-container a') as HTMLAnchorElement | null;
                        return el?.href !== href;
                    },
                    { timeout: 10000 },
                    firstJobHref
                );
            } catch {
                log.warning('Timeout waiting for page change after pagination. Ending scraping.');
                break;
            }
        } else {
            log.info('No more pages, finishing scraping.');
            break;
        }
    }

    await Dataset.pushData({
        url: page.url(),
        companyId: request.userData.companyId,
        jobs: allJobs,
    });
});
