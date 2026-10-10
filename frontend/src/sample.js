/**
 * sample.js — Sample household profile for demonstration purposes.
 * Loaded as default on first visit so results are visible immediately.
 */

export const SAMPLE_PROFILE = {
  tariff_id: "tod-domestic-illustrative",
  sanctioned_load_kw: 5,
  appliances: [
    {
      name: "EV charger",
      power_kw: 3.3,
      duration_min: 240,
      days_per_week: 6,
      current_start: "19:00",
      earliest_start: "09:00",
      latest_end: "07:00",
      shiftable: true,
    },
    {
      name: "Geyser",
      power_kw: 2.0,
      duration_min: 60,
      days_per_week: 7,
      current_start: "06:00",
      earliest_start: "04:00",
      latest_end: "09:00",
      shiftable: true,
    },
    {
      name: "Washing machine",
      power_kw: 0.8,
      duration_min: 60,
      days_per_week: 4,
      current_start: "08:00",
      earliest_start: "06:00",
      latest_end: "20:00",
      shiftable: true,
    },
  ],
};

export const APPLIANCE_TEMPLATES = [
  {
    name: "EV charger",
    power_kw: 3.3,
    duration_min: 240,
    days_per_week: 6,
    current_start: "19:00",
    earliest_start: "09:00",
    latest_end: "07:00",
    shiftable: true,
  },
  {
    name: "Geyser",
    power_kw: 2.0,
    duration_min: 60,
    days_per_week: 7,
    current_start: "06:00",
    earliest_start: "04:00",
    latest_end: "09:00",
    shiftable: true,
  },
  {
    name: "Air conditioner",
    power_kw: 1.5,
    duration_min: 180,
    days_per_week: 7,
    current_start: "21:00",
    earliest_start: "13:00",
    latest_end: "23:00",
    shiftable: true,
  },
  {
    name: "Washing machine",
    power_kw: 0.8,
    duration_min: 60,
    days_per_week: 4,
    current_start: "08:00",
    earliest_start: "06:00",
    latest_end: "20:00",
    shiftable: true,
  },
  {
    name: "Dishwasher",
    power_kw: 1.2,
    duration_min: 90,
    days_per_week: 7,
    current_start: "20:00",
    earliest_start: "09:00",
    latest_end: "23:00",
    shiftable: true,
  },
  {
    name: "Water pump",
    power_kw: 0.5,
    duration_min: 60,
    days_per_week: 7,
    current_start: "07:00",
    earliest_start: "05:00",
    latest_end: "10:00",
    shiftable: true,
  },
];
