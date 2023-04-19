import { Status } from "./types";

// Status mapping
export const STATUS = {
  [Status.Open]: "Open",
  [Status.Submitted]: "Submitted",
  [Status.Challenged]: "Challenged",
  [Status.Confirmed]: "Confirmed",
};

export const LONG_OR_SHORT = {
  long: "long",
  short: "short",
};

export const ONE_DAY = 86400;
export const ONE_HOUR = 3600;
