const scenarios = [
  ["normal Duffel Airways search", "CAI", "RUH"],
  ["PVD -> RAI no-results", "PVD", "RAI"],
  ["LHR -> DXB connecting", "LHR", "DXB"],
  ["STN -> LHR timeout", "STN", "LHR"],
  ["JFK -> EWR hold-order capability", "JFK", "EWR"],
  ["LHR -> STN price change", "LHR", "STN"],
  ["LGW -> LHR expired/unavailable offer", "LGW", "LHR"],
] as const;

if (!process.env.DUFFEL_TEST_TOKEN) {
  console.log("BLOCKED — DUFFEL_TEST_TOKEN REQUIRED");
  for (const [name] of scenarios) console.log(`DUFFEL SANDBOX | ${name} | BLOCKED`);
  process.exit(0);
}

for (const [name, from, to] of scenarios) {
  console.log(`DUFFEL SANDBOX | ${name} | READY ${from}->${to}`);
}
