// For now, just log periodically so we know the worker is running.
import "dotenv/config";
const workerName = "job-worker";

console.log(`${workerName} started`);

setInterval(() => {
  console.log(`${workerName} heartbeat at ${new Date().toISOString()}`);
}, 5000);

