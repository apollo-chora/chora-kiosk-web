// What the demo world's AI made, as the approved mockup shows it (docs/design/kiosk/apollo-kiosk-mockup.html,
// Version 6), for the dev fixtures only (T3 brief: "recorded or mockup-derived JSON"): the Companion's
// suggestions, the practice questions, the step 4 draft and its pictures, the graded scores. Every value
// below is the mockup's, cited by line; the ids are make-fixtures.mjs's. The world itself (keys, titles,
// order, edges, campaign states, cues, Companions, atoms, doses) is kiosk/world/world.json's, and the
// golden run's records replace all of it on a running stack.

/**
 * Each suggestions choice's batch, by choice key: HOOK_MAP.branches 2658 to 2666, ATLAS sugg 2705
 * and 2727, FRESH 5799 to 5829 (a `_` batch is the goal root's). [title, the Companion's why].
 */
export const SUGGESTION_BATCHES = {
  'sugg.water.newater': [
    ['Microfiltration', 'NEWater’s first step: it filters out fine particles before the membranes.'],
    ['Reverse osmosis', 'The membrane step that holds back dissolved salts. Desalination uses it too.'],
    ['UV disinfection', 'The last step: UV light destroys any germs that got through.'],
  ],
  'sugg.water.desal': [
    ['Seawater intake', 'Where desalination starts: seawater drawn in from the coast.'],
    ['Reverse osmosis', 'The membrane step that holds back salt. NEWater uses it too.'],
    ['Energy use', 'Pushing seawater through membranes takes a lot of electricity.'],
  ],
  'sugg.nature.supertrees': [
    ['Vertical gardens', 'Supertrees are covered in living plants, like gardens standing upright.'],
    ['Solar power', 'Some Supertrees carry solar panels on top.'],
  ],
  'sugg.hawker.centres': [
    ['Family-run stalls', 'Many hawker stalls are run by families who pass their recipes down.'],
    ['Tray return', 'Diners return their trays, so the next person finds a clean table.'],
  ],
  'fresh.water.newater': [
    ['Deep Tunnel Sewerage System', 'Deep tunnels carry used water by gravity to the plants where NEWater is made.'],
    ['Wafer fabs', 'Chip factories are NEWater’s biggest users: they need water purer than tap water.'],
  ],
  'fresh.water.desal': [
    ['Marina East dual-mode plant', 'It treats seawater in dry weather and reservoir water when it rains.'],
    ['Brine', 'The very salty water left over from desalination. PUB studies how to recover minerals.'],
  ],
  'fresh.water.res': [
    ['Marina Barrage', 'A dam across Marina Channel that made a city-centre reservoir and eases floods.'],
    ['ABC Waters Programme', 'Turns drains, canals and reservoirs into clean streams and lakes people can enjoy.'],
  ],
  'fresh.water.root': [
    ['Water efficiency labels', 'Ticks on taps, toilets and washing machines show how much water they save.'],
    ['Linggiu Reservoir', 'A reservoir in Johor, paid for by Singapore, that keeps the Johor River supply up.'],
  ],
  'fresh.nature.supertrees': [
    ['Gardens by the Bay', 'The garden at Marina Bay where the Supertrees stand, beside two cooled glass domes.'],
    ['Rainwater harvesting', 'Some Supertrees collect rainwater that is used to water the gardens’ plants.'],
  ],
  'fresh.nature.root': [
    ['OneMillionTrees movement', 'A drive to plant one million more trees across Singapore from 2020 to 2030.'],
    ['Bukit Timah Nature Reserve', 'It holds Singapore’s largest remaining patch of primary rainforest.'],
  ],
  'fresh.hawker.centres': [
    ['Incubation stalls', 'New hawkers can start in a ready-fitted stall at half the usual rent at first.'],
    ['Satay', 'Small pieces of meat grilled on skewers and eaten with a peanut dip.'],
  ],
  'fresh.hawker.root': [
    ['Hawker succession', 'Retiring hawkers can train a newcomer to take over their stall and recipes.'],
    ['Laksa', 'Rice noodles in a spicy soup made rich with coconut milk.'],
  ],
};

/**
 * The question each prepared set holds, by choice key: the twin's (HOOK_MAP.question 2668 to 2673)
 * and the climbing concepts' (ATLAS q, 2686 to 2734). The mockup has none for Used water, so
 * set.water.used.r3 has no fixture and its read is a loud 404 in dev.
 */
export const PRACTICE_QUESTIONS = {
  'v1.reverse-osmosis': {
    stem: 'Both NEWater and desalinated water pass through one step that pushes water through a membrane fine enough to hold back dissolved salts. Which step is it?',
    options: ['Microfiltration', 'Reverse osmosis', 'UV disinfection', 'Sedimentation'],
    correct: 1,
    explain: 'Reverse osmosis pushes water through a semi-permeable membrane under pressure. Dissolved salts and most contaminants stay behind.',
  },
  'set.water.res.r6': {
    stem: 'You are planning a new housing estate so that its rain helps fill Singapore’s reservoirs. Which plan fits best?',
    options: ['Send its rain through drains and canals into a reservoir', 'Pipe all its rain straight out to sea', 'Pave the whole estate so no puddles form', 'Buy more water from Johor instead'],
    correct: 0,
    explain: 'Collecting rain through drains and canals into reservoirs is how about two thirds of Singapore’s land already feeds its water supply.',
  },
  'set.water.import.r3': {
    stem: 'Singapore’s water agreement with Malaysia ends in 2061. Which plan best prepares the city for that day?',
    options: ['Buy a bigger share of Johor’s water now', 'Build more NEWater and desalination plants', 'Stop collecting rain in reservoirs', 'Close some reservoirs to cut costs'],
    correct: 1,
    explain: 'NEWater and desalination give Singapore water that does not depend on another country, so building them prepares for 2061.',
  },
  'set.nature.otters.r3': {
    stem: 'Smooth-coated otters are back in Singapore’s waterways. What do they mostly eat?',
    options: ['Fish', 'Leaves', 'Insects', 'Seeds'],
    correct: 0,
    explain: 'They mostly eat fish, so their return is a sign of healthier rivers and reservoirs.',
  },
  'set.nature.connectors.r4': {
    stem: 'What does Singapore’s Park Connector Network link up?',
    options: ['Parks and green spaces across the island', 'Reservoirs and the sea', 'Schools and shopping malls', 'Hawker centres and MRT stations'],
    correct: 0,
    explain: 'Park connectors link parks and green spaces across Singapore, so people can walk and cycle between them.',
  },
  'set.hawker.unesco.r3': {
    stem: 'In which year was Singapore’s hawker culture added to UNESCO’s list of intangible cultural heritage?',
    options: ['2010', '2015', '2020', '2023'],
    correct: 2,
    explain: 'UNESCO inscribed Singapore’s hawker culture in December 2020.',
  },
  'set.hawker.kopi.r4': {
    stem: 'At a kopitiam, what do you get when you order “kopi O”?',
    options: ['Coffee with condensed milk', 'Black coffee with sugar', 'Iced tea', 'Coffee with evaporated milk'],
    correct: 1,
    explain: 'Kopi O is black coffee with sugar. Kopi C adds evaporated milk; plain kopi comes with condensed milk.',
  },
};

/** The grading crew's scores for the two samples (GRADE 3545 and 3550: criteria worth 4, 4 and 2). */
export const GRADED_SCORES = { 'sample.strong': 10, 'sample.weak': 2 };
export const GRADED_POINTS_POSSIBLE = 10;

/**
 * Step 4's draft (DRAFT 4238 to 4250) and the three word chips' changes (4245 to 4247): simpler shortens
 * the stem, explain adds the key's explanation. A word revision applies its path's chips in order. K187:
 * the scenario chip replaced fixd (which replaced option D); its change here is a STAND-IN (see
 * STEP4_SCENARIO_STANDIN) until the golden run makes its drafts.
 */
/**
 * K187 STAND-INS, dev fixtures only (the orchestrator's conditions, 21 Oct): the scenario chip ("Turn it into
 * a real-life scenario") replaced fixd on 21 Oct and the golden run has not made its 11 paths' drafts yet, so
 * their recast stem and their critic note are stand-ins, labelled as such. Never in
 * step4-critique.recorded.json, never in a shipped image (the no-fixture gate); the run's own rows replace them.
 */
const STEP4_SCENARIO_STANDIN_STEM = 'At a NEWater plant, a guide shows visitors how used water is cleaned. Which stage destroys germs that slip through the membranes?';
export const STEP4_SCENARIO_STANDIN = {
  stem: STEP4_SCENARIO_STANDIN_STEM,
  critique: 'Stand-in critic note (K187): the golden run records the scenario chip’s own.',
};

export const STEP4 = {
  stem: 'The diagram shows how used water becomes NEWater. Which stage destroys germs that slip through the membranes?',
  options: ['Microfiltration', 'Reverse osmosis', 'UV disinfection', 'Chlorination'],
  correct: 2,
  chips: {
    'Turn it into a real-life scenario': { stem: STEP4_SCENARIO_STANDIN_STEM },
    'Make the question simpler': { stem: 'Which NEWater stage kills germs that get past the membranes?' },
    'Add a one-line explanation': { explainer: 'UV light damages the germs’ DNA, so they cannot multiply.' },
  },
  // The critic's notes are the golden run's own (step4-critique.recorded.json, K155), never the mockup's,
  // which had the critic flag option D and a missing stage.
};

/**
 * The step 4 diagrams as mermaid would draw them: the stages top to bottom (layoutDiagram 4366 to
 * 4394; step.* at STR.en), and where NEWater goes. Keyed by the picture each choice makes.
 */
export const DIAGRAMS = {
  'diagram-v1': { stages: ['Used water', 'Water reclamation plant', 'Microfiltration', 'Reverse osmosis', 'NEWater'], outlets: [] },
  'diagram-uv': { stages: ['Used water', 'Water reclamation plant', 'Microfiltration', 'Reverse osmosis', 'UV disinfection', 'NEWater'], outlets: [] },
  'diagram-where': {
    stages: ['Used water', 'Water reclamation plant', 'Microfiltration', 'Reverse osmosis', 'NEWater'],
    outlets: ['Industry: chip fabs, cooling', 'Reservoirs: dry-spell top-up'],
  },
  'diagram-uv-where': {
    stages: ['Used water', 'Water reclamation plant', 'Microfiltration', 'Reverse osmosis', 'UV disinfection', 'NEWater'],
    outlets: ['Industry: chip fabs, cooling', 'Reservoirs: dry-spell top-up'],
  },
};

/** The scene pictures: ILLUS_IMG (line 2609) by its key; `taps` is the open question's (5017, 5206). */
export const ILLUSTRATIONS = ['flat', 'sketch', 'photo', 'taps'];

/**
 * K159 (W27): stand-ins for the scene pictures the golden run makes for City in Nature's and Hawker
 * culture's q2 and q3, drawn as labelled SVG, never another bank's picture; the run's own replace them.
 */
export const SCENES = {
  'scene-nature-shorebirds': 'Shorebirds feeding on the Sungei Buloh mudflats',
  'scene-nature-streets': 'Two streets on a hot afternoon: one under big shady trees, one with none',
  'scene-hawker-kaya': 'A kaya toast set from a Singapore coffee shop',
  'scene-hawker-teh-tarik': 'A drinks stall holder pulling teh tarik from one mug to another',
};

/**
 * K158 (W20): the panel each prepared paper's run leaves at its review, as the golden run left them,
 * so the fit specs measure what visitors see. W52: re-made on gemma4 (K179) for the take 01a15d6e
 * (21 Oct): paper.water 01a15d66, paper.nature 01a15d67-164c, paper.hawker 01a15d67-35ac, read only
 * from consumption's weakness_doc_uploads.review_payload, verbatim.
 */
export const WEAKNESS_PANELS = {
  'paper.water': [
    { label: "Singapore's Four National Taps", summary: "The learner is familiar with the general concept of multiple water sources but is currently conflating rainwater with the broader category of local catchment and missing desalinated water.", strength: 0.4 },
    { label: "Desalination Process: Salt Removal", summary: "The learner can identify that filtration occurs in desalination but is unable to distinguish between the role of microfiltration (particle removal) and reverse osmosis (salt removal).", strength: 0.8 },
    { label: "Energy Costs of Desalination", summary: "The learner attributes the higher cost of desalinated water to the 'cleanliness' of the source water rather than the energy requirements of the process.", strength: 0.7 },
  ],
  // K206 (W90): DEV STAND-INS until the golden run reads the essay: the four gaps the essay is written to
  // reveal, worded as the approved design page's rows (round3-design.html section 5).
  'paper.water.essay': [
    { label: "How NEWater is treated", summary: "The learner thinks NEWater is boiled to make it safe.", strength: 0.8 },
    { label: "Who uses NEWater", summary: "The learner thinks most NEWater goes to home taps for drinking.", strength: 0.8 },
    { label: "Why desalination costs more", summary: "The learner again blames dirty seawater for the cost, not the energy the process needs.", strength: 0.8 },
    { label: "Brine disposal", summary: "The learner thinks the leftover brine is harmless and can be poured back into the sea anywhere.", strength: 0.8 },
  ],
  'paper.nature': [
    { label: "Otter Diet and Classification", summary: "Understanding the dietary requirements of smooth-coated otters as carnivores.", strength: 0.9 },
    { label: "Ecological Functions of Mangroves", summary: "Recognizing the critical environmental roles mangroves play in coastal protection and as nurseries for marine life.", strength: 0.8 },
    { label: "Sustainable Architecture: Supertrees", summary: "Understanding that Supertrees are man-made steel structures designed for environmental functions rather than natural trees.", strength: 0.9 },
    { label: "Plant Transpiration and Cooling", summary: "Identifying that plants cool the air not just through shade, but through the release of water vapour.", strength: 0.4 },
  ],
  'paper.hawker': [
    { label: "UNESCO Intangible Cultural Heritage", summary: "Distinguishing between tangible World Heritage sites (places) and Intangible Cultural Heritage (living practices).", strength: 0.9 },
    { label: "Singaporean Coffee Nomenclature", summary: "Understanding the specific suffixes in local coffee ordering (e.g., 'O' vs 'C').", strength: 0.7 },
    { label: "Historical Purpose of Hawker Centres", summary: "Understanding the public health and hygiene drivers behind the transition from street hawking to centralized centres in the 1970s/80s.", strength: 0.9 },
    { label: "Teh Tarik Preparation Technique", summary: "Recognizing the functional purposes of the 'pulling' motion in Teh Tarik beyond temperature control.", strength: 0.4 },
  ],
};

/** Which picture each picture-making choice's record points at. */
export const PICTURE_OF = {
  'draft.h4': 'diagram-v1.svg',
  'draft.water.q3': 'taps.jpg',
  'draft.nature.q2': 'scene-nature-shorebirds.svg',
  'draft.nature.q3': 'scene-nature-streets.svg',
  'draft.hawker.q2': 'scene-hawker-kaya.svg',
  'draft.hawker.q3': 'scene-hawker-teh-tarik.svg',
  'pic.uv': 'diagram-uv.svg',
  'pic.where': 'diagram-where.svg',
  'pic.uv.where': 'diagram-uv-where.svg',
  'pic.illus': 'flat.jpg',
  'pic.illus.sketch': 'sketch.jpg',
  'pic.illus.photo': 'photo.jpg',
  'pic.sketch.photo': 'photo.jpg',
  // K203 (W87): the pre-filled request's prepared pictures. The dev world has no picture of steel tanks;
  // the golden run makes the real ones, and these dev stand-ins show the photo they start from.
  'pic.illus.photo.tanks': 'photo.jpg',
  'pic.sketch.photo.tanks': 'photo.jpg',
  'pic.photo.sketch': 'sketch.jpg',
};
