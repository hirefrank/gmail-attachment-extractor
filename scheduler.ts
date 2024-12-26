import { main } from "./main.ts";
import { Cron } from "croner";

await console.log("Setting up the cronjobs...");

// runs every 15 minutes
new Cron("*/15 * * * *", { timezone: "America/New_York" }, async () => {
  await main();
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  await console.log(`gmail extractor cron job executed at ${timestamp}`);
});
