import { describe, expect, it } from "vitest";
import type { ObjectiveControlPeriod, ObjectiveControlProgressionEvent } from "../types";
import { findBestKothCaptureAssignment } from "../koth-capture-search";

function eventsFromTicks(ticksByTeam: ReadonlyMap<number, readonly number[]>): ObjectiveControlProgressionEvent[] {
  const merged: { timestampMs: number; teamId: number }[] = [];
  for (const [teamId, ticks] of ticksByTeam) {
    for (const timestampMs of ticks) {
      merged.push({ timestampMs, teamId });
    }
  }
  merged.sort((a, b) => a.timestampMs - b.timestampMs);

  const running = new Map<number, number>([...ticksByTeam.keys()].map((teamId) => [teamId, 0]));
  return merged.map(({ timestampMs, teamId }) => {
    running.set(teamId, (running.get(teamId) ?? 0) + 1);
    return { timestampMs, teamId, runningScores: Object.fromEntries(running) };
  });
}

function controlPeriod(startMs: number, endMs: number, controllingTeamId: number | null): ObjectiveControlPeriod {
  return { startMs, endMs, controllingTeamId };
}

// Real match 5c39e8a4-1986-4221-8c9e-dbb46fdfe2ca (2:1 Eagle). Captures verified against
// gameplay footage: Eagle at 3:14 and 5:03, Cobra at 7:00; hill 4 never captured.
const MATCH_5C39_TICKS = new Map<number, readonly number[]>([
  [
    0,
    [
      90431, 95436, 160302, 165308, 170313, 178355, 188384, 193666, 215421, 236776, 268792, 278629, 283626, 288631,
      293636, 302478, 349342, 354346, 389532, 394537, 401661, 406666, 476853,
    ],
  ],
  [1, [113656, 134710, 139715, 144720, 313589, 329956, 373733, 378738, 383743, 416175, 419812]],
]);

// Real match 72c3006a-82fc-48a2-8a2f-f862b675f984 (3:0 Eagle). Captures verified against
// gameplay footage: Eagle at 2:36, 4:28 and 7:02; hill 4 never captured.
const MATCH_72C3_TICKS = new Map<number, readonly number[]>([
  [
    0,
    [
      57618, 63077, 101948, 104834, 109839, 143123, 156837, 209993, 232048, 236603, 241608, 254354, 259359, 264365,
      268352, 298449, 304638, 309643, 314649, 358059, 365683, 396881, 422941, 499318,
    ],
  ],
  [
    1,
    [
      68362, 172836, 177842, 182846, 187851, 192856, 197847, 202852, 327194, 340124, 348198, 382067, 393661, 434319,
      440992, 446615, 457960,
    ],
  ],
]);

// Simplified from the match's byte2 film data: the Cobra scoring run at 2:51–3:30 means an
// Eagle capture read at 3:29 (209993) would sit inside an opponent-controlled window.
const MATCH_72C3_CONTROL_PERIODS: ObjectiveControlPeriod[] = [
  controlPeriod(156000, 158000, 0),
  controlPeriod(171000, 210000, 1),
  controlPeriod(227000, 297000, 0),
  controlPeriod(396000, 425000, 0),
];

// Real match 3a1dd96b-35e8-46e4-997a-abe592ad195a (4:1 Eagle, one Eagle hill pre-awarded in the
// lobby so only 3 Eagle captures exist in-film). Captures verified against gameplay footage:
// Cobra at 2:45, Eagle at 4:42, 6:34 and 8:14 (match ends on the final capture).
const MATCH_3A1D_TICKS = new Map<number, readonly number[]>([
  [
    0,
    [
      42741, 47732, 112170, 117159, 122766, 134111, 147967, 176399, 182739, 187728, 198911, 227834, 232823, 237829,
      247138, 278521, 282192, 347895, 353788, 358497, 363503, 370728, 375719, 389419, 395359, 458591, 463597, 468604,
      473611, 478615, 483621, 488631, 495423,
    ],
  ],
  [
    1,
    [
      67059, 72065, 77074, 82080, 93450, 160280, 165285, 212147, 257354, 271526, 292307, 297318, 316835, 321840, 326851,
      330922, 416398, 421387, 426395, 431403, 436412, 438981,
    ],
  ],
]);

// Simplified from the match's byte2 film data: Cobra dominated 2:34–3:44, so an Eagle capture
// read at 3:07 (187728) would sit inside an opponent-controlled window.
const MATCH_3A1D_CONTROL_PERIODS: ObjectiveControlPeriod[] = [
  controlPeriod(154000, 224000, 1),
  controlPeriod(224000, 278000, 0),
  controlPeriod(281000, 288000, 0),
  controlPeriod(292000, 342000, 1),
  controlPeriod(343000, 398000, 0),
  controlPeriod(452000, 503000, 0),
];

// Real match 93f5e373-8984-4714-915c-e55b31c8404e (4:3 Eagle, ends on the final capture at
// 12:22). Captures verified against gameplay footage: Cobra at 2:00, 3:49 and 5:37, then Eagle
// at 6:32, 8:01, 9:28 and 12:20. Eagle reached 95% at 2:55 (7 perfect-cadence ticks — ~35s of
// meter, short of the 40s capture) without capturing; the meter-time feasibility rule is what
// stops that run from being read as a capture.
const MATCH_93F5_TICKS = new Map<number, readonly number[]>([
  [
    0,
    [
      62163, 67168, 72173, 145901, 150907, 155898, 160909, 165914, 170919, 175924, 241790, 247996, 253001, 258007,
      262328, 349047, 359175, 364453, 367757, 372747, 380123, 385131, 388651, 392139, 403877, 408882, 419626, 437415,
      460456, 474571, 477808, 481561, 507420, 512426, 518231, 524288, 529293, 534297, 566797, 632280, 638419, 653167,
      724108, 729113, 734118, 738739, 742726,
    ],
  ],
  [
    1,
    [
      50218, 81099, 86103, 91108, 96113, 101106, 106112, 120143, 195343, 200348, 205353, 214646, 219651, 224656, 229661,
      271804, 276809, 281814, 288003, 293009, 298014, 303019, 337937, 543390, 549696, 554701, 596927, 686585, 691590,
      696595,
    ],
  ],
]);

// Real match f5a8c16b-f99c-489f-a34a-825a9d256a4d (3:2 Eagle, ends on time). Captures verified
// against gameplay footage: Cobra at 4:04 (NOT 3:48 — Cobra was at ~80% there and Eagle ~90%),
// Eagle at 5:28, 7:53 and 9:56, Cobra at 10:49. The under-tick cost keeps hill 1 from being cut
// at Cobra's 7th tick, and the window-mismatch key keeps hill 3 at 7:54 (Eagle's own window)
// instead of 8:37 (inside a Cobra window).
const MATCH_F5A8_TICKS = new Map<number, readonly number[]>([
  [
    0,
    [
      107244, 112249, 142363, 155242, 188359, 193364, 203976, 265471, 270476, 277517, 282788, 290930, 318527, 323532,
      328521, 365246, 370251, 375256, 459227, 464232, 469237, 474242, 517603, 530982, 548917, 553922, 558927, 563932,
      591160, 596165,
    ],
  ],
  [
    1,
    [
      122709, 130117, 177181, 201206, 210749, 218190, 228351, 238744, 243749, 301694, 306699, 399884, 404889, 437839,
      444696, 504205, 573208, 580783, 614383, 619388, 624393, 629398, 634403, 639408, 644413, 649402, 659528,
    ],
  ],
]);

// Simplified from the match's byte2 film data: the hill-3 boundary candidates fall in an
// Eagle window (456-480s, the true 7:54 capture) and a Cobra window (480-522s, the false 8:37).
const MATCH_F5A8_CONTROL_PERIODS: ObjectiveControlPeriod[] = [
  controlPeriod(227000, 257000, 1),
  controlPeriod(317000, 372000, 0),
  controlPeriod(456000, 480000, 0),
  controlPeriod(480000, 522000, 1),
  controlPeriod(523000, 597000, 0),
  controlPeriod(627000, 679000, 1),
];

// Real match 5bbe0481-3ab8-486a-b05c-0d53895beb7d (3:2 Cobra, ends on time). The first fully
// blind-verified match: all six hills confirmed in theatre with no corrections. Cobra at 2:21,
// Eagle at 5:23 (Cobra one tick short), Cobra at 7:29 and 8:52, Eagle at 10:43.
const MATCH_5BBE_TICKS = new Map<number, readonly number[]>([
  [
    0,
    [
      88300, 98093, 184393, 196307, 232310, 243671, 248676, 282784, 288323, 295547, 298950, 323892, 357293, 380182,
      385187, 406725, 411730, 416735, 545215, 569975, 574980, 579985, 595905, 635892, 640896, 643883,
    ],
  ],
  [
    1,
    [
      48493, 57636, 62641, 119698, 124703, 128641, 135997, 141003, 213191, 218196, 269488, 304222, 306841, 316452,
      320839, 340693, 344329, 425643, 431700, 436705, 441710, 446715, 449651, 473526, 480800, 485804, 507426, 513382,
      518387, 523393, 532519,
    ],
  ],
]);

// Simplified from the match's byte2 film data: reading hill 1 as ending at Cobra's 3:38 tick
// instead of 2:21 would place the capture inside an Eagle-attributed window (205-259s).
const MATCH_5BBE_CONTROL_PERIODS: ObjectiveControlPeriod[] = [
  controlPeriod(123000, 171000, 1),
  controlPeriod(205000, 259000, 0),
  controlPeriod(297000, 324000, 1),
  controlPeriod(419000, 463000, 1),
  controlPeriod(530000, 562000, 1),
  controlPeriod(641000, 644000, 0),
];

describe("findBestKothCaptureAssignment", () => {
  it("returns the verified capture timestamps for match 5c39e8a4 (2:1, Cobra takes hill 3)", () => {
    const events = eventsFromTicks(MATCH_5C39_TICKS);
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 2],
        [1, 1],
      ]),
      [],
    );
    expect(result).toEqual([193666, 302478, 419812]);
  });

  it("attributes the 419812 capture of match 5c39e8a4 to Cobra", () => {
    const events = eventsFromTicks(MATCH_5C39_TICKS);
    const capturingEvent = events.find((event) => event.timestampMs === 419812);
    expect(capturingEvent?.teamId).toBe(1);
  });

  it("returns the verified capture timestamps for match 72c3006a (3:0 Eagle)", () => {
    const events = eventsFromTicks(MATCH_72C3_TICKS);
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 3],
        [1, 0],
      ]),
      MATCH_72C3_CONTROL_PERIODS,
    );
    expect(result).toEqual([156837, 268352, 422941]);
  });

  it("returns the verified capture timestamps for match 3a1dd96b (Cobra first, contested hills)", () => {
    const events = eventsFromTicks(MATCH_3A1D_TICKS);
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 3],
        [1, 1],
      ]),
      MATCH_3A1D_CONTROL_PERIODS,
    );
    expect(result).toEqual([165285, 282192, 395359, 495423]);
  });

  it("returns the verified capture timestamps for match 93f5e373 (95% near-miss not a capture)", () => {
    const events = eventsFromTicks(MATCH_93F5_TICKS);
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 4],
        [1, 3],
      ]),
      [],
    );
    expect(result).toEqual([120143, 229661, 337937, 392139, 481561, 566797, 742726]);
  });

  it("returns the verified capture timestamps for match f5a8c16b (no capture cut short of the meter)", () => {
    const events = eventsFromTicks(MATCH_F5A8_TICKS);
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 3],
        [1, 2],
      ]),
      MATCH_F5A8_CONTROL_PERIODS,
    );
    expect(result).toEqual([243749, 328521, 474242, 596165, 649402]);
  });

  it("returns the verified capture timestamps for match 5bbe0481 (fully blind-verified)", () => {
    const events = eventsFromTicks(MATCH_5BBE_TICKS);
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 2],
        [1, 3],
      ]),
      MATCH_5BBE_CONTROL_PERIODS,
    );
    expect(result).toEqual([141003, 323892, 449651, 532519, 643883]);
  });

  it("never places a capture on a tick followed within the relocation gap by another tick", () => {
    // Ticks every 5000ms in one continuous 10-tick burst; a capture mid-burst is impossible
    // because the hill would have relocated. Only the final tick qualifies.
    const events = eventsFromTicks(
      new Map([[0, [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000]]]),
    );
    const result = findBestKothCaptureAssignment(events, new Map([[0, 1]]), []);
    expect(result).toEqual([50000]);
  });

  it("places only the captures that fit when the match score exceeds available ticks", () => {
    const events = eventsFromTicks(new Map([[0, [5000, 10000, 15000, 20000, 25000]]]));
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 3],
        [1, 2],
      ]),
      [],
    );
    expect(result).toEqual([25000]);
  });

  it("returns empty when there are no events", () => {
    const result = findBestKothCaptureAssignment([], new Map([[0, 2]]), []);
    expect(result).toEqual([]);
  });

  it("returns empty when no team has enough ticks for a capture", () => {
    const events = eventsFromTicks(new Map([[0, [5000, 10000]]]));
    const result = findBestKothCaptureAssignment(events, new Map([[0, 1]]), []);
    expect(result).toEqual([]);
  });

  it("prefers uniform per-hill tick counts over a lopsided split", () => {
    // Two 8-tick Team 0 hills and a 7-tick Team 1 hill: {8,8,7} beats splits like {5,11,7}.
    const events = eventsFromTicks(
      new Map<number, readonly number[]>([
        [
          0,
          [
            5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 60000, 65000, 70000, 75000, 80000, 85000, 90000,
            95000,
          ],
        ],
        [1, [115000, 120000, 125000, 130000, 135000, 140000, 145000]],
      ]),
    );
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 2],
        [1, 1],
      ]),
      [],
    );
    expect(result).toEqual([40000, 95000, 145000]);
  });

  it("rejects a capture read into the middle of another team's control window", () => {
    // Team 0 can be read as capturing at 40000 (8 ticks) or 75000 (9 ticks); without control
    // periods the 9-tick reading wins on uniformity against team 1's 9-tick capture. But the
    // control period says team 1 owned the window around 75000 and team 1 scores again inside
    // that window (at 90000) — the hill demonstrably did not relocate at 75000.
    const events = eventsFromTicks(
      new Map<number, readonly number[]>([
        [0, [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 75000]],
        [1, [90000, 95000, 100000, 105000, 110000, 115000, 120000, 125000, 130000]],
      ]),
    );
    const withoutPeriods = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 1],
        [1, 1],
      ]),
      [],
    );
    const withPeriods = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 1],
        [1, 1],
      ]),
      [controlPeriod(60000, 95000, 1)],
    );
    expect(withoutPeriods).toEqual([75000, 130000]);
    expect(withPeriods).toEqual([40000, 130000]);
  });
});
