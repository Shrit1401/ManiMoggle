import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "recompute-calibration",
  { hours: 6 },
  api.calibration.computeAndSave,
  {},
);

crons.interval(
  "cleanup-reactions",
  { minutes: 5 },
  api.reactions.cleanup,
  {},
);

export default crons;
