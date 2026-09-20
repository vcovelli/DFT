import { defaultSettings, services, type Settings } from "@/lib/domain";
// Display shape used by the original marketing cards. All values are integer cents.
export function displayPricing(config: Settings) {
  return {
    lessonPlans: {
      label: services.lessonPlans,
      options: config.prices.lessonPlans,
    },
    doNows: { label: services.doNows, options: config.prices.doNows },
    exitTickets: {
      label: services.exitTickets,
      options: config.prices.exitTickets,
    },
    doNowExitTicket: {
      label: services.doNowExitTicket,
      options: config.prices.doNowExitTicket,
    },
    completeUnit: {
      label: services.completeUnit,
      flat: config.prices.completeUnit,
    },
    assessment: { label: services.assessment, flat: config.prices.assessment },
    rush: { label: "Rush service", flat: config.prices.rush },
  };
}
export const pricing = displayPricing(defaultSettings);
export type DurationKey = "daily" | "weekly" | "monthly";
