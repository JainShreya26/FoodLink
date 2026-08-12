import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const daysFromNow = (d: number) =>
  new Date(Date.now() + d * 24 * 60 * 60 * 1000);

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
] as const;

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
  ],
  "San Jose Family Food Bank": [
    ["Corn tortillas", "Grain", 200, "packs", 21, "Local producer"],
    ["Pinto beans", "Protein", 160, "lbs", 365, "USDA shipment"],
    ["Canned soup", "Other", 140, "cans", 400, "Safeway donation"],
    ["Avocados", "Fruit", 55, "lbs", 8, "Local farm"],
    ["Zucchini", "Vegetable", 70, "lbs", 11, "Local farm"],
    ["Powdered milk", "Dairy", 40, "boxes", 300, "USDA shipment"],
  ],
  "Sacramento Valley Food Bank": [
    ["Almonds", "Protein", 65, "lbs", 240, "Central Valley co-op"],
    ["Canned tomatoes", "Vegetable", 180, "cans", 420, "Del Monte"],
    ["Flour", "Grain", 250, "lbs", 180, "USDA shipment"],
    ["Peaches", "Fruit", 90, "lbs", 7, "Local orchard"],
    ["Cottage cheese", "Dairy", 30, "each", 12, "Dairy co-op"],
    ["Beef stew", "Protein", 75, "cans", 500, "Community drive"],
  ],
};

const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);

/** [direction, sourceType, sourceName, hoursOut, status, driver, phone, lines] */
type ShipmentRow = [
  string,
  string,
  string,
  number,
  string,
  string | null,
  string | null,
  [string, string, number, string][],
];

const SHIPMENTS: Record<string, ShipmentRow[]> = {
  "Sacramento Valley Food Bank": [
    [
      "INBOUND", "USDA", "USDA TEFAP quarterly", 52, "CONFIRMED",
      "Marcus Bell", "(916) 555-0142",
      [["Flour", "Grain", 400, "lbs"], ["Beef stew", "Protein", 120, "cans"]],
    ],
    [
      "INBOUND", "RESCUE", "Raley's produce rescue", 20, "DELAYED",
      "Anita Cruz", "(916) 555-0177",
      [["Peaches", "Fruit", 60, "lbs"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Mobile pantry — Del Paso", 30, "SCHEDULED",
      null, null,
      [["Canned tomatoes", "Vegetable", 90, "cans"], ["Almonds", "Protein", 40, "lbs"]],
    ],
  ],
  "Alameda County Food Bank": [
    [
      "INBOUND", "DONOR", "Safeway Broadway", 26, "SCHEDULED",
      "Ray Okafor", "(510) 555-0119",
      [["Canned corn", "Vegetable", 150, "cans"], ["Whole milk", "Dairy", 30, "gallons"]],
    ],
    [
      "OUTBOUND", "TRANSFER", "Agency order — St. Mary's", 44, "CONFIRMED",
      null, null,
      [["White rice", "Grain", 200, "lbs"]],
    ],
  ],
  "Oakland Community Food Bank": [
    [
      "INBOUND", "RESCUE", "Trader Joe's Rockridge", 14, "CONFIRMED",
      "Deb Nguyen", "(510) 555-0163",
      [["Bread loaves", "Grain", 60, "each"], ["Bananas", "Fruit", 45, "lbs"]],
    ],
  ],
};

const PAR_LEVELS: Record<string, [string, string, number][]> = {
  "Sacramento Valley Food Bank": [
    ["Flour", "lbs", 200],
    ["Canned tomatoes", "cans", 150],
    ["Almonds", "lbs", 50],
  ],
  "Alameda County Food Bank": [
    ["White rice", "lbs", 250],
    ["Canned tuna", "cans", 150],
  ],
};

async function main() {
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

    // Deliveries and par levels are re-seeded independently of inventory so an
    // existing demo database still picks up the projection data.
    if ((await prisma.shipment.count({ where: { foodBankId: record.id } })) === 0) {
      for (const [
        direction,
        sourceType,
        sourceName,
        hoursOut,
        status,
        driverName,
        driverPhone,
        lines,
      ] of SHIPMENTS[bank.name] ?? []) {
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
    }

    for (const [name, unit, minQuantity] of PAR_LEVELS[bank.name] ?? []) {
      await prisma.parLevel.upsert({
        where: { foodBankId_name_unit: { foodBankId: record.id, name, unit } },
        update: { minQuantity },
        create: { foodBankId: record.id, name, unit, minQuantity },
      });
    }

    // Only seed inventory for banks that have none, so existing data survives re-seeds.
    const existing = await prisma.inventoryItem.count({
      where: { foodBankId: record.id },
    });
    if (existing > 0) continue;

    await prisma.inventoryItem.createMany({
      data: (INVENTORY[bank.name] ?? []).map(
        ([name, category, quantity, unit, expiryDays, source]) => ({
          foodBankId: record.id,
          name,
          category,
          quantity,
          unit,
          expiryDate: expiryDays === null ? null : daysFromNow(expiryDays),
          source,
        }),
      ),
    });
  }

  console.log(
    `Seeded ${BANKS.length} food banks with locations, inventory, scheduled deliveries and par levels.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
