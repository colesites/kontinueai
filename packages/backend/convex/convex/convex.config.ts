import { defineApp } from "convex/server";
import firecrawlScrape from "convex-firecrawl-scrape/convex.config";

const app = defineApp();

app.use(firecrawlScrape, {
    name: "firecrawlScrape",
});

export default app;
