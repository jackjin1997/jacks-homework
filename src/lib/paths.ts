import path from "path";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const KB_DIR = path.join(DATA_DIR, "kb");
export const TICKETS_OPEN = path.join(ROOT, "tickets", "open");
export const TICKETS_CLOSED = path.join(ROOT, "tickets", "closed");
