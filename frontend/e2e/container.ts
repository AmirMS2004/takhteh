import { execSync } from "node:child_process";
import path from "node:path";

// A throwaway container for e2e tests, so they never touch the real board on port 8000.
export const CONTAINER = "pm-kanban-e2e";
export const PORT = 8001;
export const BASE_URL = `http://localhost:${PORT}`;
const ROOT = path.resolve(__dirname, "..", "..");

const docker = (args: string) => execSync(`docker ${args}`, { cwd: ROOT, stdio: "pipe" });

export async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE_URL}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${CONTAINER} did not become healthy`);
}

export async function startContainer() {
  docker("build -q -t pm-kanban .");
  removeContainer();
  // No data volume: the database lives inside the container and is discarded with it.
  docker(`run -d --name ${CONTAINER} -p ${PORT}:8000 pm-kanban`);
  await waitForHealth();
}

export async function restartContainer() {
  docker(`restart ${CONTAINER}`);
  await waitForHealth();
}

export function removeContainer() {
  try {
    docker(`rm -f ${CONTAINER}`);
  } catch {
    // not running
  }
}
