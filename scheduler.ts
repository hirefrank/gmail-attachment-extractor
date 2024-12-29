import { main } from "./main.ts";
import { Cron } from "croner";

await console.log("Setting up the cronjobs...");

// runs every hour
new Cron("0 * * * *", { timezone: "America/New_York" }, async () => {
  await main();
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  await console.log(`gmail extractor cron job executed at ${timestamp}`);
});
