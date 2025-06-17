import { createPuppeteerRouter, Dataset } from 'crawlee';
import { Page } from 'puppeteer';

export const router = createPuppeteerRouter();

router.addDefaultHandler(async ({ enqueueLinks, log }) => {
    log.info(`enqueueing new URLs`);
    await enqueueLinks({
        globs: ['https://www.linkedin.com/jobs/search/*'],
        label: 'jobs',
    });
});

router.addHandler('jobs', async ({ page, request, log }) => {    
    await page.evaluate(() => window.scrollBy(0, 500));

    const verTodosSelector = 'a.org-jobs-recently-posted-jobs-module__show-all-jobs-btn-link';

    try {
        const verTodosButton = await page.waitForSelector(verTodosSelector, { timeout: 5000 });
    
        if (verTodosButton) {
            log.info('Clickeando en "Mostrar todos los empleos"...');
    
            try {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }),
                    verTodosButton.click(),
                ]);
            } catch (navErr) {
                log.warning('Click funcionó, pero no hubo navegación. Probablemente se cargó contenido por AJAX.');
            }
        }
    } catch (err) {
        log.warning('No se encontró el botón "Mostrar todos los empleos" o hubo un timeout.');
    }
    

    const allJobs = [];

    while (true) {
        log.info('Scrapeando empleos en:', { url: page.url() });

        try {
            await page.waitForSelector('.job-card-container', { timeout: 2000 });
        } catch {
            log.warning('No se encontraron resultados de empleos.');
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

        const jobs = await page.evaluate(() => {
            return [...document.querySelectorAll('.job-card-container')].map((el) => ({
                title: el.querySelector('.job-card-list__title--link')?.textContent?.trim() ?? null,
                company: el.querySelector('.artdeco-entity-lockup__subtitle')?.textContent?.trim() ?? null,
                location: el.querySelector('.job-card-container__metadata-wrapper')?.textContent?.trim() ?? null,
                link: el.querySelector('a')?.href ?? null,
            }));
        });

        allJobs.push(...jobs);

        const nextButtonSelector = '.jobs-search-pagination__button--next';
        const nextButton = await page.$(nextButtonSelector);
        
        if (nextButton) {
            const firstJobHref = await page.evaluate(() => {
                const firstJob = document.querySelector('.job-card-container a');
                return firstJob?.href ?? null;
            });
        
            log.info('Pasando a la siguiente página...');
            await nextButton.click();
        
            try {
                await page.waitForFunction(
                    (href) => {
                        const firstJob = document.querySelector('.job-card-container a');
                        return firstJob?.href !== href;
                    },
                    { timeout: 10000 },
                    firstJobHref
                );
            } catch {
                log.warning('Timeout esperando cambio de contenido tras paginación. Asumiendo fin o error.');
                break;
            }
        } else {
            log.info('No hay más páginas. Terminando scraping.');
            break;
        }
    }

    await Dataset.pushData({
        url: page.url(),
        companyId: request.url.match(/company\/(\d+)/)?.[1] ?? null,
        jobs: allJobs,
    });
});
