import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);
const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

/**
 * Nine banks rather than five, and clustered: every bank now has neighbours
 * inside the board's default 50-mile radius, so the network view is populated
 * whichever bank the demo login lands on. Sacramento and Stockton stay far
 * enough out to exercise the "beyond N miles" hint.
 */
const BANKS = [
  {
    name: "Alameda County Food Bank",
    address: "7900 Edgewater Dr, Oakland, CA",
    latitude: 37.7484,
    longitude: -122.1907,
  },
  {
    name: "Oakland Community Food Bank",
    address: "1900 Broadway, Oakland, CA",
    latitude: 37.8079,
    longitude: -122.2688,
  },
  {
    name: "Berkeley Food Pantry",
    address: "1600 Sacramento St, Berkeley, CA",
    latitude: 37.8807,
    longitude: -122.2818,
  },
  {
    name: "San Jose Family Food Bank",
    address: "4001 N First St, San Jose, CA",
    latitude: 37.4104,
    longitude: -121.9447,
  },
  {
    name: "Sacramento Valley Food Bank",
    address: "3333 Third Ave, Sacramento, CA",
    latitude: 38.5449,
    longitude: -121.4682,
  },
  {
    name: "Santa Clara Valley Food Center",
    address: "2140 Walsh Ave, Santa Clara, CA",
    latitude: 37.3541,
    longitude: -121.9552,
  },
  {
    name: "Fremont Family Pantry",
    address: "39155 Liberty St, Fremont, CA",
    latitude: 37.5485,
    longitude: -121.9886,
  },
  {
    name: "Peninsula Food Pantry",
    address: "1450 Veterans Blvd, Redwood City, CA",
    latitude: 37.4852,
    longitude: -122.2364,
  },
  {
    name: "Stockton Community Kitchen",
    address: "704 E Industrial Park Dr, Stockton, CA",
    latitude: 37.9577,
    longitude: -121.2908,
  },
] as const;

/** [name, category, quantity, unit, expiryDays (null = none), source] */
type ItemRow = [string, string, number, string, number | null, string | null];

const INVENTORY: Record<string, ItemRow[]> = {
  "Alameda County Food Bank": [
    ["White rice", "Grain", 300, "lbs", 180, "USDA shipment"],
    ["Canned black beans", "Protein", 120, "cans", 365, "Safeway donation"],
    ["Peanut butter", "Protein", 45, "jars", 90, "Community drive"],
    ["Canned corn", "Vegetable", 80, "cans", 400, "Safeway donation"],
    ["Fresh apples", "Fruit", 60, "lbs", 10, "Local farm"],
    ["Whole milk", "Dairy", 25, "gallons", 6, "Dairy co-op"],
    ["Pasta", "Grain", 150, "lbs", 300, "USDA shipment"],
    ["Canned tuna", "Protein", 200, "cans", 500, "Costco donation"],
    ["Carrots", "Vegetable", 40, "lbs", 12, "Local farm"],
    ["Cereal boxes", "Grain", 70, "boxes", 120, "General Mills"],
    ["Canned peaches", "Fruit", 55, "cans", 365, "Community drive"],
    ["Cheddar cheese", "Dairy", 15, "lbs", 20, "Dairy co-op"],
    ["Baby formula", "Other", 24, "cans", 240, "Retail purchase"],
    ["Diapers size 3", "Other", 30, "packs", null, "Community drive"],
    ["Vegetable oil", "Other", 48, "bottles", 300, "Costco donation"],
    ["Sliced turkey", "Protein", 18, "lbs", -2, "Deli rescue"],
    ["Romaine lettuce", "Vegetable", 22, "lbs", 3, "Local farm"],
  ],
  "Oakland Community Food Bank": [
    ["Brown rice", "Grain", 90, "lbs", 200, "USDA shipment"],
    ["Canned chicken", "Protein", 60, "cans", 400, "Church drive"],
    ["Lentils", "Protein", 110, "lbs", 365, "USDA shipment"],
    ["Canned green beans", "Vegetable", 95, "cans", 380, "Trader Joe's"],
    ["Bananas", "Fruit", 30, "lbs", 4, "Local grocer"],
    ["Yogurt cups", "Dairy", 80, "each", 8, "Dairy co-op"],
    ["Bread loaves", "Grain", 40, "each", 3, "Local bakery"],
    ["Eggs", "Protein", 50, "dozen", 14, "Local farm"],
    ["Potatoes", "Vegetable", 130, "lbs", 30, "Local farm"],
    ["Orange juice", "Fruit", 20, "gallons", 15, "Costco donation"],
    ["Halal chicken thighs", "Protein", 65, "lbs", 5, "Halal Meats Intl"],
    ["Masa harina", "Grain", 80, "lbs", 210, "La Reyna donation"],
    ["Canned coconut milk", "Other", 96, "cans", 420, "Trader Joe's"],
    ["Spinach", "Vegetable", 18, "lbs", -1, "Local farm"],
    ["Apple sauce cups", "Fruit", 140, "each", 260, "Community drive"],
  ],
  "Berkeley Food Pantry": [
    ["Quinoa", "Grain", 35, "lbs", 250, "Whole Foods"],
    ["Canned salmon", "Protein", 45, "cans", 450, "Community drive"],
    ["Chickpeas", "Protein", 75, "lbs", 365, "USDA shipment"],
    ["Frozen mixed vegetables", "Vegetable", 60, "lbs", 90, "Trader Joe's"],
    ["Oranges", "Fruit", 45, "lbs", 9, "Local farm"],
    ["Butter", "Dairy", 12, "lbs", 45, "Dairy co-op"],
    ["Oatmeal", "Grain", 85, "lbs", 200, "Quaker donation"],
    ["Tofu", "Protein", 25, "lbs", 7, "Local producer"],
    ["Onions", "Vegetable", 50, "lbs", 40, "Local farm"],
    ["Raisins", "Fruit", 30, "boxes", 300, "Community drive"],
    ["Soy milk", "Dairy", 36, "each", 150, "Whole Foods"],
    ["Gluten-free pasta", "Grain", 40, "boxes", 280, "Whole Foods"],
    ["Baby formula", "Other", 12, "cans", 200, "Retail purchase"],
    ["Kale", "Vegetable", 15, "lbs", 2, "Local farm"],
  ],
  "San Jose Family Food Bank": [
    ["Corn tortillas", "Grain", 200, "packs", 21, "Local producer"],
    ["Pinto beans", "Protein", 160, "lbs", 365, "USDA shipment"],
    ["Canned soup", "Other", 140, "cans", 400, "Safeway donation"],
    ["Avocados", "Fruit", 55, "lbs", 8, "Local farm"],
    ["Zucchini", "Vegetable", 70, "lbs", 11, "Local farm"],
    ["Powdered milk", "Dairy", 40, "boxes", 300, "USDA shipment"],
    ["White rice", "Grain", 240, "lbs", 190, "USDA shipment"],
    ["Canned tuna", "Protein", 90, "cans", 480, "Costco donation"],
    ["Jasmine rice", "Grain", 120, "lbs", 220, "Lion Market donation"],
    ["Fish sauce", "Other", 40, "bottles", 400, "Lion Market donation"],
    ["Nopales", "Vegetable", 25, "lbs", 5, "Local farm"],
    ["Queso fresco", "Dairy", 18, "lbs", 9, "Local producer"],
    ["Peanut butter", "Protein", 60, "jars", 120, "Community drive"],
    ["Strawberries", "Fruit", 30, "lbs", -3, "Watsonville rescue"],
    ["Diapers size 2", "Other", 22, "packs", null, "Community drive"],
  ],
  "Sacramento Valley Food Bank": [
    ["Almonds", "Protein", 65, "lbs", 240, "Central Valley co-op"],
    ["Canned tomatoes", "Vegetable", 180, "cans", 420, "Del Monte"],
    ["Flour", "Grain", 250, "lbs", 180, "USDA shipment"],
    ["Peaches", "Fruit", 90, "lbs", 7, "Local orchard"],
    ["Cottage cheese", "Dairy", 30, "each", 12, "Dairy co-op"],
    ["Beef stew", "Protein", 75, "cans", 500, "Community drive"],
    ["Walnuts", "Protein", 55, "lbs", 210, "Central Valley co-op"],
    ["Sweet corn", "Vegetable", 140, "lbs", 6, "Local orchard"],
    ["Sugar", "Other", 120, "lbs", 500, "USDA shipment"],
    ["Canned pears", "Fruit", 160, "cans", 380, "Del Monte"],
    ["Whole wheat bread", "Grain", 55, "each", 4, "Sunrise Bakery"],
  ],
  "Santa Clara Valley Food Center": [
    ["Jasmine rice", "Grain", 320, "lbs", 240, "Lion Market donation"],
    ["Canned sardines", "Protein", 130, "cans", 460, "Community drive"],
    ["Bok choy", "Vegetable", 40, "lbs", 5, "Local farm"],
    ["Soy sauce", "Other", 60, "bottles", 400, "Lion Market donation"],
    ["Mandarins", "Fruit", 75, "lbs", 12, "Local orchard"],
    ["Rice noodles", "Grain", 95, "packs", 300, "Lion Market donation"],
    ["Firm tofu", "Protein", 45, "lbs", 6, "Local producer"],
    ["Evaporated milk", "Dairy", 110, "cans", 350, "Safeway donation"],
    ["Baby formula", "Other", 18, "cans", 210, "Retail purchase"],
    ["Cooking oil", "Other", 70, "bottles", 320, "Costco donation"],
  ],
  "Fremont Family Pantry": [
    ["Basmati rice", "Grain", 210, "lbs", 260, "India Cash & Carry"],
    ["Red lentils", "Protein", 140, "lbs", 340, "India Cash & Carry"],
    ["Chickpea flour", "Grain", 60, "lbs", 200, "Community drive"],
    ["Halal chicken thighs", "Protein", 40, "lbs", 4, "Halal Meats Intl"],
    ["Canned chickpeas", "Protein", 180, "cans", 430, "Costco donation"],
    ["Cucumbers", "Vegetable", 35, "lbs", 6, "Local farm"],
    ["Ghee", "Dairy", 24, "each", 280, "India Cash & Carry"],
    ["Mangoes", "Fruit", 28, "lbs", 4, "Local grocer"],
    ["Whole wheat atta", "Grain", 150, "lbs", 190, "India Cash & Carry"],
    ["Diapers size 4", "Other", 18, "packs", null, "Community drive"],
  ],
  "Peninsula Food Pantry": [
    ["Pasta", "Grain", 175, "lbs", 290, "USDA shipment"],
    ["Marinara sauce", "Other", 130, "jars", 380, "Trader Joe's"],
    ["Canned tuna", "Protein", 150, "cans", 470, "Costco donation"],
    ["Broccoli", "Vegetable", 45, "lbs", 5, "Local farm"],
    ["Apples", "Fruit", 80, "lbs", 14, "Local orchard"],
    ["String cheese", "Dairy", 200, "each", 25, "Dairy co-op"],
    ["Granola bars", "Grain", 240, "each", 160, "Community drive"],
    ["Black beans", "Protein", 190, "lbs", 355, "USDA shipment"],
    ["Bell peppers", "Vegetable", 30, "lbs", -1, "Local farm"],
    ["Whole milk", "Dairy", 34, "gallons", 7, "Dairy co-op"],
  ],
  "Stockton Community Kitchen": [
    ["Long grain rice", "Grain", 280, "lbs", 200, "USDA shipment"],
    ["Canned chili", "Protein", 165, "cans", 450, "Community drive"],
    ["Asparagus", "Vegetable", 55, "lbs", 4, "Delta growers"],
    ["Cherries", "Fruit", 40, "lbs", 3, "Delta growers"],
    ["Powdered milk", "Dairy", 60, "boxes", 320, "USDA shipment"],
    ["Dried beans", "Protein", 200, "lbs", 400, "USDA shipment"],
    ["Tortilla chips", "Grain", 90, "bags", 90, "Safeway donation"],
    ["Watermelon", "Fruit", 65, "lbs", 5, "Delta growers"],
  ],
};

/** [direction, sourceType, sourceName, hoursOut, status, driver, phone, consent, note, lines] */
type ShipmentRow = [
  string,
  string,
  string,
  number,
  string,
  string | null,
  string | null,
  boolean,
  string | null,
  [string, string, number, string][],
];

const SHIPMENTS: Record<string, ShipmentRow[]> = {
  "Sacramento Valley Food Bank": [
    [
      "INBOUND", "USDA", "USDA TEFAP quarterly", 52, "CONFIRMED",
      "Marcus Bell", "(916) 555-0142", true, "Dock 2 — needs a pallet jack",
      [["Flour", "Grain", 400, "lbs"], ["Beef stew", "Protein", 120, "cans"]],
    ],
    [
      "INBOUND", "RESCUE", "Raley's produce rescue", 20, "DELAYED",
      "Anita Cruz", "(916) 555-0177", true, "Cold chain — unload first",
      [["Peaches", "Fruit", 60, "lbs"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Mobile pantry — Del Paso", 30, "SCHEDULED",
      null, null, false, null,
      [["Canned tomatoes", "Vegetable", 90, "cans"], ["Almonds", "Protein", 40, "lbs"]],
    ],
    [
      "INBOUND", "DONOR", "Sunrise Bakery daily", 8, "CONFIRMED",
      "Owen Pratt", "(916) 555-0198", false, "Back gate, ring twice",
      [["Whole wheat bread", "Grain", 70, "each"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Stockton Community Kitchen", 72, "SCHEDULED",
      null, null, false, "Reciprocal — they cover us on rice in October",
      [["Canned pears", "Fruit", 80, "cans"], ["Sugar", "Other", 60, "lbs"]],
    ],
    [
      "INBOUND", "PURCHASE", "Restaurant Depot run", -30, "RECEIVED",
      "Marcus Bell", "(916) 555-0142", true, null,
      [["Cottage cheese", "Dairy", 40, "each"]],
    ],
    [
      "INBOUND", "RESCUE", "Nugget Markets rescue", 46, "CANCELLED",
      "Tina Alvarez", "(916) 555-0121", true, "Truck broke down — rebooking",
      [["Sweet corn", "Vegetable", 120, "lbs"]],
    ],
  ],
  "Alameda County Food Bank": [
    [
      "INBOUND", "DONOR", "Safeway Broadway", 26, "SCHEDULED",
      "Ray Okafor", "(510) 555-0119", true, null,
      [["Canned corn", "Vegetable", 150, "cans"], ["Whole milk", "Dairy", 30, "gallons"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Agency order — St. Mary's", 44, "CONFIRMED",
      null, null, false, "They collect, no driver needed",
      [["White rice", "Grain", 200, "lbs"]],
    ],
    [
      "INBOUND", "USDA", "USDA TEFAP monthly", 96, "SCHEDULED",
      "Gloria Sands", "(510) 555-0155", true, "Big drop — clear floor space",
      [
        ["Pasta", "Grain", 300, "lbs"],
        ["Canned tuna", "Protein", 240, "cans"],
        ["Vegetable oil", "Other", 60, "bottles"],
      ],
    ],
    [
      "INBOUND", "RESCUE", "Berkeley Bowl produce", 6, "ARRIVED",
      "Sam Dhillon", "(510) 555-0184", true, "At the dock now",
      [["Carrots", "Vegetable", 90, "lbs"], ["Fresh apples", "Fruit", 70, "lbs"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Mobile pantry — Fruitvale", 54, "SCHEDULED",
      "Ray Okafor", "(510) 555-0119", true, null,
      [["Canned black beans", "Protein", 60, "cans"], ["Cereal boxes", "Grain", 40, "boxes"]],
    ],
  ],
  "Oakland Community Food Bank": [
    [
      "INBOUND", "RESCUE", "Trader Joe's Rockridge", 14, "CONFIRMED",
      "Deb Nguyen", "(510) 555-0163", true, null,
      [["Bread loaves", "Grain", 60, "each"], ["Bananas", "Fruit", 45, "lbs"]],
    ],
    [
      "INBOUND", "DONOR", "Halal Meats International", 34, "SCHEDULED",
      "Yusuf Karim", "(510) 555-0190", false, "Frozen — needs freezer space",
      [["Halal chicken thighs", "Protein", 120, "lbs"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Berkeley Food Pantry", 40, "CONFIRMED",
      "Deb Nguyen", "(510) 555-0163", true, null,
      [["Lentils", "Protein", 50, "lbs"], ["Canned green beans", "Vegetable", 40, "cans"]],
    ],
    [
      "INBOUND", "RESCUE", "La Reyna Tortilleria", 18, "DELAYED",
      "Marisol Vega", "(510) 555-0146", true, null,
      [["Masa harina", "Grain", 100, "lbs"]],
    ],
  ],
  "Berkeley Food Pantry": [
    [
      "INBOUND", "TRANSFER", "Oakland Community Food Bank", 40, "CONFIRMED",
      "Deb Nguyen", "(510) 555-0163", true, "Matching the outbound on their side",
      [["Lentils", "Protein", 50, "lbs"], ["Canned green beans", "Vegetable", 40, "cans"]],
    ],
    [
      "INBOUND", "RESCUE", "Whole Foods Telegraph", 12, "SCHEDULED",
      "Priya Raman", "(510) 555-0172", true, null,
      [["Soy milk", "Dairy", 48, "each"], ["Oranges", "Fruit", 40, "lbs"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "UC Berkeley student pantry", 60, "SCHEDULED",
      null, null, false, "Weekly standing order",
      [["Oatmeal", "Grain", 40, "lbs"], ["Gluten-free pasta", "Grain", 20, "boxes"]],
    ],
  ],
  "San Jose Family Food Bank": [
    [
      "INBOUND", "USDA", "USDA TEFAP monthly", 30, "CONFIRMED",
      "Hector Ramos", "(408) 555-0133", true, "Dock 1, 7am sharp",
      [
        ["White rice", "Grain", 400, "lbs"],
        ["Powdered milk", "Dairy", 60, "boxes"],
        ["Pinto beans", "Protein", 200, "lbs"],
      ],
    ],
    [
      "INBOUND", "RESCUE", "Watsonville berry rescue", 16, "DELAYED",
      "Luz Herrera", "(831) 555-0107", true, "Refrigerated — 4 hour shelf life",
      [["Strawberries", "Fruit", 90, "lbs"]],
    ],
    [
      "INBOUND", "DONOR", "Lion Market Story Rd", 50, "SCHEDULED",
      "Minh Tran", "(408) 555-0168", false, null,
      [["Jasmine rice", "Grain", 300, "lbs"], ["Fish sauce", "Other", 40, "bottles"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Mobile pantry — Alum Rock", 38, "SCHEDULED",
      "Hector Ramos", "(408) 555-0133", true, null,
      [["Corn tortillas", "Grain", 80, "packs"], ["Canned soup", "Other", 60, "cans"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Santa Clara Valley Food Center", 24, "CONFIRMED",
      null, null, false, "They collect",
      [["Peanut butter", "Protein", 30, "jars"]],
    ],
    [
      "INBOUND", "RESCUE", "Safeway Blossom Hill", 10, "CANCELLED",
      "Dana Fields", "(408) 555-0159", true, "Store cancelled — nothing to collect",
      [["Zucchini", "Vegetable", 50, "lbs"]],
    ],
  ],
  "Santa Clara Valley Food Center": [
    [
      "INBOUND", "TRANSFER", "San Jose Family Food Bank", 24, "CONFIRMED",
      null, null, false, null,
      [["Peanut butter", "Protein", 30, "jars"]],
    ],
    [
      "INBOUND", "DONOR", "Lion Market Santa Clara", 42, "SCHEDULED",
      "Minh Tran", "(408) 555-0168", true, null,
      [["Rice noodles", "Grain", 120, "packs"], ["Soy sauce", "Other", 40, "bottles"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Agency order — Sunnyvale Community Services", 66, "SCHEDULED",
      null, null, false, null,
      [["Jasmine rice", "Grain", 150, "lbs"], ["Evaporated milk", "Dairy", 60, "cans"]],
    ],
  ],
  "Fremont Family Pantry": [
    [
      "INBOUND", "DONOR", "India Cash & Carry", 28, "CONFIRMED",
      "Amrit Sethi", "(510) 555-0128", true, "Side entrance on Liberty",
      [["Basmati rice", "Grain", 250, "lbs"], ["Red lentils", "Protein", 120, "lbs"]],
    ],
    [
      "INBOUND", "RESCUE", "Costco Fremont rescue", 15, "SCHEDULED",
      "Beth Osei", "(510) 555-0111", false, null,
      [["Canned chickpeas", "Protein", 200, "cans"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Mobile pantry — Centerville", 48, "SCHEDULED",
      "Amrit Sethi", "(510) 555-0128", true, null,
      [["Whole wheat atta", "Grain", 80, "lbs"], ["Ghee", "Dairy", 12, "each"]],
    ],
  ],
  "Peninsula Food Pantry": [
    [
      "INBOUND", "USDA", "USDA TEFAP monthly", 62, "SCHEDULED",
      "Carla Mendes", "(650) 555-0174", true, null,
      [["Pasta", "Grain", 300, "lbs"], ["Black beans", "Protein", 220, "lbs"]],
    ],
    [
      "INBOUND", "RESCUE", "Trader Joe's Redwood City", 9, "CONFIRMED",
      "Joel Barrett", "(650) 555-0139", true, "Produce only today",
      [["Broccoli", "Vegetable", 60, "lbs"], ["Apples", "Fruit", 90, "lbs"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Agency order — Fair Oaks Community Center", 36, "SCHEDULED",
      null, null, false, null,
      [["Granola bars", "Grain", 120, "each"], ["String cheese", "Dairy", 100, "each"]],
    ],
  ],
  "Stockton Community Kitchen": [
    [
      "INBOUND", "TRANSFER", "Sacramento Valley Food Bank", 72, "SCHEDULED",
      null, null, false, null,
      [["Canned pears", "Fruit", 80, "cans"], ["Sugar", "Other", 60, "lbs"]],
    ],
    [
      "INBOUND", "RESCUE", "Delta growers gleaning", 22, "CONFIRMED",
      "Rosa Delgado", "(209) 555-0164", true, "Volunteers unload",
      [["Asparagus", "Vegetable", 80, "lbs"], ["Cherries", "Fruit", 50, "lbs"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Mobile pantry — south Stockton", 44, "SCHEDULED",
      "Rosa Delgado", "(209) 555-0164", true, null,
      [["Long grain rice", "Grain", 120, "lbs"], ["Canned chili", "Protein", 80, "cans"]],
    ],
  ],
};

const PAR_LEVELS: Record<string, [string, string, number][]> = {
  "Sacramento Valley Food Bank": [
    ["Flour", "lbs", 200],
    ["Canned tomatoes", "cans", 150],
    ["Almonds", "lbs", 50],
    ["Whole wheat bread", "each", 80],
  ],
  "Alameda County Food Bank": [
    ["White rice", "lbs", 250],
    ["Canned tuna", "cans", 150],
    ["Baby formula", "cans", 40],
    ["Whole milk", "gallons", 40],
  ],
  "San Jose Family Food Bank": [
    ["Corn tortillas", "packs", 250],
    ["Pinto beans", "lbs", 150],
    ["White rice", "lbs", 300],
    ["Powdered milk", "boxes", 60],
  ],
  "Oakland Community Food Bank": [
    ["Eggs", "dozen", 80],
    ["Halal chicken thighs", "lbs", 100],
    ["Bread loaves", "each", 60],
  ],
  "Berkeley Food Pantry": [
    ["Baby formula", "cans", 30],
    ["Tofu", "lbs", 40],
  ],
  "Santa Clara Valley Food Center": [
    ["Jasmine rice", "lbs", 300],
    ["Baby formula", "cans", 36],
  ],
  "Fremont Family Pantry": [
    ["Basmati rice", "lbs", 250],
    ["Halal chicken thighs", "lbs", 120],
  ],
  "Peninsula Food Pantry": [
    ["Pasta", "lbs", 200],
    ["Whole milk", "gallons", 50],
  ],
  "Stockton Community Kitchen": [["Long grain rice", "lbs", 300]],
};

/** [type, itemName, quantity, unit, contactName, contactInfo, note, hoursAgo] */
type FlagRow = [
  "SURPLUS" | "SHORTAGE",
  string,
  number,
  string,
  string,
  string,
  string | null,
  number,
];

const FLAGS: Record<string, FlagRow[]> = {
  "Alameda County Food Bank": [
    [
      "SURPLUS", "Canned tuna", 180, "cans", "Ray Okafor", "(510) 555-0119",
      "Costco over-delivered. Good until 2027, happy to split a pallet.", 6,
    ],
    [
      "SURPLUS", "Romaine lettuce", 22, "lbs", "Ray Okafor", "ray@alamedafoodbank.org",
      "Must move by Friday — no walk-in space.", 3,
    ],
    [
      "SHORTAGE", "Baby formula", 60, "cans", "Gloria Sands", "(510) 555-0155",
      "Three new infants on the roster this week and we are down to 24 cans.", 20,
    ],
  ],
  "Oakland Community Food Bank": [
    [
      "SURPLUS", "Masa harina", 80, "lbs", "Marisol Vega", "(510) 555-0146",
      "La Reyna doubled our usual drop.", 11,
    ],
    [
      "SHORTAGE", "Eggs", 40, "dozen", "Deb Nguyen", "deb@oaklandcfb.org",
      "Our farm donor paused for the month.", 30,
    ],
    [
      "SURPLUS", "Canned coconut milk", 96, "cans", "Deb Nguyen", "(510) 555-0163",
      "Not moving with our clients — someone else will use these faster.", 50,
    ],
  ],
  "Berkeley Food Pantry": [
    [
      "SHORTAGE", "Baby formula", 40, "boxes", "Priya Raman", "(510) 555-0172",
      "Serving 22 new families this month.", 26,
    ],
    [
      "SURPLUS", "Gluten-free pasta", 40, "boxes", "Priya Raman", "priya@berkeleypantry.org",
      "Donated in bulk, low demand here.", 14,
    ],
  ],
  "San Jose Family Food Bank": [
    [
      "SURPLUS", "Fish sauce", 40, "bottles", "Hector Ramos", "(408) 555-0133",
      "Lion Market donation, more than our clients ask for.", 8,
    ],
    [
      "SHORTAGE", "Corn tortillas", 200, "packs", "Hector Ramos", "hector@sjfamilyfoodbank.org",
      "Par is 250 packs and the mobile pantry takes 80 of what we have.", 5,
    ],
    [
      "SHORTAGE", "Whole milk", 30, "gallons", "Rosa Iglesias", "(408) 555-0181",
      "No dairy donor in the South Bay right now.", 40,
    ],
    // Gets fully covered by the Oakland transfer below, leaving Berkeley's
    // conversation open against nothing — the case the request thread has to
    // explain rather than offer an empty quantity box for.
    [
      "SHORTAGE", "Baby formula", 40, "boxes", "Priya Raman", "priya@sjfamilyfoodbank.org",
      "Serving 60 new families this month, completely out.", 60,
    ],
  ],
  "Santa Clara Valley Food Center": [
    [
      "SURPLUS", "Jasmine rice", 150, "lbs", "Minh Tran", "(408) 555-0168",
      "Standing donation exceeds what we distribute.", 9,
    ],
    [
      "SHORTAGE", "Diapers size 4", 25, "packs", "Ana Sandoval", "ana@scvfoodcenter.org",
      "Nothing in stock and four families asking.", 33,
    ],
  ],
  "Fremont Family Pantry": [
    [
      "SURPLUS", "Canned chickpeas", 120, "cans", "Amrit Sethi", "(510) 555-0128",
      "Costco rescue landed twice this week.", 4,
    ],
    [
      "SHORTAGE", "Cooking oil", 50, "bottles", "Beth Osei", "beth@fremontpantry.org",
      "Every household asks and we have none.", 17,
    ],
  ],
  "Peninsula Food Pantry": [
    [
      "SURPLUS", "Granola bars", 200, "each", "Carla Mendes", "(650) 555-0174",
      "School drive overshot — great for the mobile runs.", 7,
    ],
    [
      "SHORTAGE", "Halal chicken thighs", 80, "lbs", "Joel Barrett", "(650) 555-0139",
      "Growing halal demand, no supplier yet.", 28,
    ],
  ],
  "Sacramento Valley Food Bank": [
    [
      "SURPLUS", "Canned tomatoes", 120, "cans", "Nina Brooks", "(916) 555-0102",
      "Del Monte seconds — dented tins, contents fine.", 12,
    ],
    [
      "SHORTAGE", "Whole wheat bread", 60, "each", "Nina Brooks", "nina@sacvalleyfb.org",
      "Bakery cut us to two runs a week.", 22,
    ],
  ],
  "Stockton Community Kitchen": [
    [
      "SURPLUS", "Asparagus", 55, "lbs", "Rosa Delgado", "(209) 555-0164",
      "Delta gleaning glut, three day shelf life.", 2,
    ],
    [
      "SHORTAGE", "Powdered milk", 40, "boxes", "Rosa Delgado", "rosa@stocktonkitchen.org",
      null, 36,
    ],
  ],
};

/**
 * Conversations against the flags above.
 *
 * [flagBank, flagItemName, requesterBank, status, agreed, final, cancelReason,
 *  scheduledHoursOut (null = not booked), handoverNote,
 *  messages as [senderBank, text, minutesAgo]]
 */
type RequestRow = [
  string,
  string,
  string,
  "OPEN" | "COMPLETED" | "CANCELLED",
  number | null,
  number | null,
  string | null,
  number | null,
  string | null,
  [string, string, number][],
];

const REQUESTS: RequestRow[] = [
  [
    "Alameda County Food Bank", "Canned tuna", "Oakland Community Food Bank",
    "OPEN", 90, null, null, 30, "Deb collects, dock 4 — ask for Ray",
    [
      ["Oakland Community Food Bank", "Hi Ray — we'd like to take the canned tuna. When can we arrange pickup?", 320],
      ["Alameda County Food Bank", "Morning! We can do any weekday before 3pm. How much were you thinking?", 300],
      ["Oakland Community Food Bank", "Half the pallet would be perfect — 90 cans. We can collect Thursday.", 285],
      ["Alameda County Food Bank", "90 works. I've put it on the board as proposed. Ask for Ray at dock 4.", 270],
    ],
  ],
  [
    "Berkeley Food Pantry", "Baby formula", "Alameda County Food Bank",
    "OPEN", null, null, null, null, null,
    [
      ["Alameda County Food Bank", "Hi Priya — we can help with the baby formula. How much do you still need?", 180],
      ["Berkeley Food Pantry", "Anything you can spare. We're at 12 cans with 22 families on the list.", 150],
      ["Alameda County Food Bank", "We're short ourselves this week but a USDA drop lands Thursday. Can I confirm Friday?", 120],
      ["Berkeley Food Pantry", "Friday is fine, thank you. I'll hold the request open.", 100],
    ],
  ],
  [
    "San Jose Family Food Bank", "Corn tortillas", "Santa Clara Valley Food Center",
    "COMPLETED", 120, 120, null, -18, "Routed straight from the La Reyna run",
    [
      ["Santa Clara Valley Food Center", "Hi Hector — we can help with the corn tortillas. How much do you still need?", 900],
      ["San Jose Family Food Bank", "120 packs would put us back at par. Can you spare that?", 880],
      ["Santa Clara Valley Food Center", "Yes — La Reyna delivers to us Tuesday, we'll route 120 packs straight to you.", 860],
      ["San Jose Family Food Bank", "Perfect, that saves our Alum Rock run. Thank you.", 840],
      ["Santa Clara Valley Food Center", "✅ Santa Clara Valley Food Center marked this complete — 120 packs of Corn tortillas transferred.", 700],
    ],
  ],
  [
    "Fremont Family Pantry", "Canned chickpeas", "Peninsula Food Pantry",
    "COMPLETED", 60, 60, null, -6, "Joel collected, 2pm",
    [
      ["Peninsula Food Pantry", "Hi Amrit — we'd like to take the canned chickpeas. When can we arrange pickup?", 520],
      ["Fremont Family Pantry", "Any afternoon this week. 60 cans OK for you?", 500],
      ["Peninsula Food Pantry", "60 is great. Joel will collect Wednesday around 2.", 480],
      ["Peninsula Food Pantry", "✅ Peninsula Food Pantry marked this complete — 60 cans of Canned chickpeas transferred.", 300],
    ],
  ],
  [
    "Oakland Community Food Bank", "Eggs", "Berkeley Food Pantry",
    "CANCELLED", null, null, "Our farm donor came back — no longer needed", null, null,
    [
      ["Berkeley Food Pantry", "Hi Deb — we can help with the eggs. How much do you still need?", 700],
      ["Oakland Community Food Bank", "40 dozen would cover us to month end.", 690],
      ["Berkeley Food Pantry", "Let me check with our farm. Might be tight.", 660],
      ["Oakland Community Food Bank", "Our donor just resumed — cancelling this so you don't hold stock for us. Thanks anyway!", 400],
    ],
  ],
  [
    "Peninsula Food Pantry", "Granola bars", "Oakland Community Food Bank",
    "OPEN", null, null, null, null, null,
    [
      ["Oakland Community Food Bank", "Hi Carla — we'd like to take the granola bars. When can we arrange pickup?", 90],
      ["Peninsula Food Pantry", "Any time before Friday. How many can you use?", 70],
    ],
  ],
  [
    "Santa Clara Valley Food Center", "Jasmine rice", "Fremont Family Pantry",
    "OPEN", 100, null, null, 54, "Four 25lb sacks, Amrit driving down",
    [
      ["Fremont Family Pantry", "Hi Minh — we'd like to take the jasmine rice. When can we arrange pickup?", 240],
      ["Santa Clara Valley Food Center", "Happy to. It's bagged in 25lb sacks, so multiples of 25.", 220],
      ["Fremont Family Pantry", "100 lbs then — four sacks. We can drive down Monday.", 200],
    ],
  ],
  [
    "Stockton Community Kitchen", "Asparagus", "Sacramento Valley Food Bank",
    "OPEN", 30, null, null, 14, "Refrigerated van, back dock",
    [
      ["Sacramento Valley Food Bank", "Hi Rosa — we'd like to take the asparagus. When can we arrange pickup?", 60],
      ["Stockton Community Kitchen", "It won't hold past Thursday. Can you get a van down today or tomorrow?", 45],
      ["Sacramento Valley Food Bank", "Tomorrow morning works. 30 lbs is all our cold space allows.", 30],
    ],
  ],
  [
    "Sacramento Valley Food Bank", "Canned tomatoes", "Stockton Community Kitchen",
    "COMPLETED", 60, 60, null, -20, null,
    [
      ["Stockton Community Kitchen", "Hi Nina — we'd like to take the canned tomatoes. When can we arrange pickup?", 1400],
      ["Sacramento Valley Food Bank", "Dented tins, labels intact. 60 cans yours if you want them.", 1380],
      ["Stockton Community Kitchen", "We'll take them — our chili line goes through tomatoes fast.", 1360],
      ["Stockton Community Kitchen", "✅ Stockton Community Kitchen marked this complete — 60 cans of Canned tomatoes transferred.", 1200],
    ],
  ],
  [
    "Alameda County Food Bank", "Romaine lettuce", "Berkeley Food Pantry",
    "OPEN", null, null, null, null, null,
    [
      ["Berkeley Food Pantry", "Hi Ray — we'd like to take the romaine lettuce. When can we arrange pickup?", 25],
    ],
  ],
  // Two banks answered the same shortage. Oakland covered all 40 boxes, which
  // closes the flag — so Berkeley's thread is left open with nothing to move.
  // Order matters: the completed one must come first for the reconcile pass.
  [
    "San Jose Family Food Bank", "Baby formula", "Oakland Community Food Bank",
    "COMPLETED", 40, 40, null, -14, "Collected from the Broadway warehouse",
    [
      ["Oakland Community Food Bank", "Hi Priya — we can help with the baby formula. How much do you still need?", 2000],
      ["San Jose Family Food Bank", "All 40 boxes if you can. We have nothing on the shelf.", 1980],
      ["Oakland Community Food Bank", "We can cover the full 40. Sending them down with the Tuesday run.", 1960],
      ["Oakland Community Food Bank", "✅ Oakland Community Food Bank marked this complete — 40 boxes of Baby formula transferred.", 1900],
    ],
  ],
  [
    "San Jose Family Food Bank", "Baby formula", "Berkeley Food Pantry",
    "OPEN", null, null, null, null, null,
    [
      ["Berkeley Food Pantry", "Hi Priya Raman — we can help with the Baby formula. How much do you still need?", 1890],
    ],
  ],
];

/** [bank, sourceName, minutesAgoAsked, outcome (null = no answer yet), etaMinutes] */
const CHECK_INS: [string, string, number, string | null, number | null][] = [
  ["Sacramento Valley Food Bank", "Raley's produce rescue", 95, "DELAYED", 90],
  ["San Jose Family Food Bank", "Watsonville berry rescue", 70, null, null],
  ["Alameda County Food Bank", "Berkeley Bowl produce", 25, "ON_TIME", null],
  ["Oakland Community Food Bank", "La Reyna Tortilleria", 130, "DELAYED", 60],
  ["Peninsula Food Pantry", "Trader Joe's Redwood City", 15, "ON_TIME", null],
];

async function main() {
  const bankIds = new Map<string, string>();

  for (const bank of BANKS) {
    const record = await prisma.foodBank.upsert({
      where: { name: bank.name },
      update: {
        address: bank.address,
        latitude: bank.latitude,
        longitude: bank.longitude,
      },
      create: bank,
    });
    bankIds.set(bank.name, record.id);

    // Everything below is added only where it is missing, so re-running the
    // seed enriches an existing demo database instead of duplicating it or
    // throwing away hand-made state.
    const existingShipments = await prisma.shipment.findMany({
      where: { foodBankId: record.id },
      select: { sourceName: true },
    });
    const haveShipment = new Set(existingShipments.map((s) => s.sourceName));

    for (const [
      direction,
      sourceType,
      sourceName,
      hoursOut,
      status,
      driverName,
      driverPhone,
      driverConsent,
      note,
      lines,
    ] of SHIPMENTS[bank.name] ?? []) {
      if (haveShipment.has(sourceName)) continue;
      await prisma.shipment.create({
        data: {
          foodBankId: record.id,
          direction,
          sourceType,
          sourceName,
          scheduledFor: hoursFromNow(hoursOut),
          windowEnd: hoursFromNow(hoursOut + 2),
          status,
          driverName,
          driverPhone,
          driverConsent,
          note,
          etaMinutes: status === "DELAYED" ? 90 : null,
          lines: {
            create: lines.map(([name, category, quantity, unit]) => ({
              name,
              category,
              quantity,
              unit,
              expiryDate: daysFromNow(120),
            })),
          },
        },
      });
    }

    for (const [name, unit, minQuantity] of PAR_LEVELS[bank.name] ?? []) {
      await prisma.parLevel.upsert({
        where: { foodBankId_name_unit: { foodBankId: record.id, name, unit } },
        update: { minQuantity },
        create: { foodBankId: record.id, name, unit, minQuantity },
      });
    }

    // Keyed on name+unit rather than a blanket "has any inventory" check, so
    // banks seeded before this file grew still pick up the new lines.
    const existingItems = await prisma.inventoryItem.findMany({
      where: { foodBankId: record.id },
      select: { name: true, unit: true },
    });
    const haveItem = new Set(
      existingItems.map((i) => `${i.name.toLowerCase()}::${i.unit.toLowerCase()}`),
    );

    for (const [name, category, quantity, unit, expiryDays, source] of
      INVENTORY[bank.name] ?? []) {
      if (haveItem.has(`${name.toLowerCase()}::${unit.toLowerCase()}`)) continue;
      const item = await prisma.inventoryItem.create({
        data: {
          foodBankId: record.id,
          name,
          category,
          quantity,
          unit,
          expiryDate: expiryDays === null ? null : daysFromNow(expiryDays),
          source,
        },
      });
      // Without this the history panel opens on "No events recorded".
      await prisma.inventoryEvent.create({
        data: {
          itemId: item.id,
          foodBankId: record.id,
          itemName: item.name,
          action: "CREATED",
          actorBankId: record.id,
          quantityAfter: quantity,
          note: source ? `Booked in from ${source}` : null,
        },
      });
    }
  }

  // ---- Flags -------------------------------------------------------------
  const flagIds = new Map<string, string>();

  for (const [bankName, rows] of Object.entries(FLAGS)) {
    const foodBankId = bankIds.get(bankName);
    if (!foodBankId) continue;

    for (const [
      type,
      itemName,
      quantity,
      unit,
      contactName,
      contactInfo,
      note,
      hoursAgo,
    ] of rows) {
      const existing = await prisma.flag.findFirst({
        where: { foodBankId, type, itemName },
      });
      if (existing) {
        flagIds.set(`${bankName}::${itemName}`, existing.id);
        continue;
      }
      const flag = await prisma.flag.create({
        data: {
          foodBankId,
          type,
          itemName,
          quantity,
          unit,
          contactName,
          contactInfo,
          note,
          createdAt: hoursFromNow(-hoursAgo),
        },
      });
      flagIds.set(`${bankName}::${itemName}`, flag.id);
    }
  }

  // ---- Requests ----------------------------------------------------------
  for (const [
    flagBank,
    itemName,
    requesterBank,
    status,
    agreed,
    final,
    cancelReason,
    scheduledHoursOut,
    handoverNote,
    messages,
  ] of REQUESTS) {
    const flagId = flagIds.get(`${flagBank}::${itemName}`);
    const requesterBankId = bankIds.get(requesterBank);
    const posterBankId = bankIds.get(flagBank);
    if (!flagId || !requesterBankId || !posterBankId) continue;

    const existing = await prisma.request.findFirst({
      where: { flagId, requesterBankId },
    });
    if (existing) continue;

    const openedAt = hoursFromNow(-(messages[0][2] / 60));
    const request = await prisma.request.create({
      data: {
        flagId,
        requesterBankId,
        status,
        agreedQuantity: agreed,
        finalQuantity: final,
        cancelReason,
        scheduledFor:
          scheduledHoursOut === null ? null : hoursFromNow(scheduledHoursOut),
        handoverNote,
        createdAt: openedAt,
        messages: {
          create: messages.map(([sender, text, ago]) => ({
            senderBankId: bankIds.get(sender)!,
            text,
            createdAt: minutesAgo(ago),
          })),
        },
      },
    });

    // The activity log is what makes a thread legible after the fact, so every
    // seeded request carries the events its state implies.
    const events: { actorBankId: string; action: string; detail: string | null; createdAt: Date }[] =
      [
        {
          actorBankId: requesterBankId,
          action: "CREATED",
          detail: null,
          createdAt: openedAt,
        },
      ];
    if (agreed !== null) {
      events.push({
        actorBankId: requesterBankId,
        action: "QUANTITY_PROPOSED",
        detail: `${agreed} proposed`,
        createdAt: minutesAgo(messages[messages.length - 1][2] + 1),
      });
    }
    if (scheduledHoursOut !== null) {
      events.push({
        actorBankId: requesterBankId,
        action: "SCHEDULED",
        detail: hoursFromNow(scheduledHoursOut).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        createdAt: minutesAgo(messages[messages.length - 1][2] + 1),
      });
    }
    if (status === "COMPLETED" && final !== null) {
      events.push({
        actorBankId: requesterBankId,
        action: "COMPLETED",
        detail: `${final} of ${itemName} transferred`,
        createdAt: minutesAgo(messages[messages.length - 1][2]),
      });
    }
    if (status === "CANCELLED") {
      events.push({
        actorBankId: posterBankId,
        action: "CANCELLED",
        detail: cancelReason,
        createdAt: minutesAgo(messages[messages.length - 1][2]),
      });
    }
    await prisma.requestEvent.createMany({
      data: events.map((e) => ({ ...e, requestId: request.id })),
    });

  }

  // Reconcile flag quantities against completed transfers.
  //
  // Computed from the seed's own numbers rather than decremented in place: a
  // decrement is not idempotent, so re-running the seed drained every flag that
  // had a completed request against it down to zero and closed it.
  for (const [bankName, rows] of Object.entries(FLAGS)) {
    const foodBankId = bankIds.get(bankName);
    if (!foodBankId) continue;

    for (const [, itemName, postedQuantity] of rows) {
      const flagId = flagIds.get(`${bankName}::${itemName}`);
      if (!flagId) continue;

      const transferred = REQUESTS.filter(
        (r) => r[0] === bankName && r[1] === itemName && r[3] === "COMPLETED",
      ).reduce((sum, r) => sum + (r[5] ?? 0), 0);

      const remaining = Math.max(postedQuantity - transferred, 0);
      await prisma.flag.update({
        where: { id: flagId },
        data: {
          quantity: remaining,
          status: remaining <= 0 ? "CLOSED" : "OPEN",
        },
      });
    }
  }

  // ---- Driver check-ins --------------------------------------------------
  for (const [bankName, sourceName, askedAgo, outcome, eta] of CHECK_INS) {
    const foodBankId = bankIds.get(bankName);
    if (!foodBankId) continue;
    const shipment = await prisma.shipment.findFirst({
      where: { foodBankId, sourceName },
    });
    if (!shipment) continue;
    if ((await prisma.checkIn.count({ where: { shipmentId: shipment.id } })) > 0) {
      continue;
    }

    await prisma.checkIn.create({
      data: {
        shipmentId: shipment.id,
        token: randomBytes(32).toString("hex"),
        channel: "SMS",
        requestedAt: minutesAgo(askedAgo),
        expiresAt: hoursFromNow(24),
        respondedAt: outcome ? minutesAgo(Math.max(askedAgo - 12, 1)) : null,
        outcome,
        etaMinutes: eta,
        deliveryStatus: "LOGGED",
        deliveryDetail:
          "Sending is off (FOODLINK_SMS_ENABLED is not 1) — message logged, not sent.",
      },
    });
  }

  const [banks, items, shipments, flags, requests] = await Promise.all([
    prisma.foodBank.count(),
    prisma.inventoryItem.count(),
    prisma.shipment.count(),
    prisma.flag.count(),
    prisma.request.count(),
  ]);

  console.log(
    `Seeded: ${banks} food banks · ${items} inventory items · ${shipments} deliveries · ${flags} board flags · ${requests} requests.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
