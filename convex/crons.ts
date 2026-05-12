import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Recompute landmark→AI calibration offsets every 6 hours.
// No-ops when there are fewer than 10 paired scan records.
crons.interval(
  "recompute-calibration",
  { hours: 6 },
  api.calibration.computeAndSave,
  {},
);

export default crons;
