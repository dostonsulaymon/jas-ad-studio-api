import type { Brief } from '../public/brief.schema';
import { creativeFormatSchema, type CreativeFormat } from './format.schema';

/**
 * D-056: ten real videos came out in one shape because the prompt hard-coded seventeen
 * sections in a fixed order. A format now decides which sections appear, in what order,
 * how many beats, and how energetic the camera may be.
 *
 * Adding a format is a config entry, never a prompt rewrite — the same principle D-012
 * applies to video targets.
 */

const FIDELITY_SECTIONS = ['Product reference and source of truth', 'Product lock'] as const;

const PRODUCT_FILM = {
  id: 'product-film',
  version: 2,
  labelUz: 'Studiya reklamasi',
  descriptionUz:
    "Toza fonda, sokin kamera bilan mahsulotni diqqat bilan ko'rsatadigan reklama.",
  intent:
    'A composed product film that lets the viewer study the object. Restraint is the point: the product is the subject and the camera serves it.',
  sections: [
    ...FIDELITY_SECTIONS,
    'Commercial concept',
    'Creative direction',
    'Opening hook',
    'Camera',
    'Product motion',
    'Environment',
    'Lighting',
    'Material and texture treatment',
    'Sequence',
    'Editing rhythm',
    'Audio',
    'Hero ending',
    'Visual quality',
    'Fidelity requirements',
    'Avoidance',
  ],
  beats: { default: 3, max: 4 },
  shotSecondsRange: [2, 3.5],
  energy: 'restrained',
  cameraVocabulary: [
    'slow push-in',
    'controlled dolly',
    'macro glide',
    'lateral tracking',
    'restrained handheld drift',
    'nearly static hero framing',
    'focus pull',
  ],
  transitions: ['direct cut', 'match cut', 'focus transition', 'light transition'],
  productMotion: ['resting still', 'slow rotation on its surface', 'lifted or placed by hand'],
  atmosphere: [],
  interactionBoundary: null,
} as const satisfies Record<string, unknown>;

const HIGH_ENERGY = {
  id: 'high-energy',
  version: 2,
  labelUz: 'Tezkor reklama',
  descriptionUz:
    "Tez kadrlar va keskin o'tishlar bilan, ijtimoiy tarmoqlar uchun shiddatli reklama.",
  intent:
    'A fast product launch film with the pacing of a music video. It must grab attention in the first half second and never let the product become unreadable while doing it.',
  sections: [
    ...FIDELITY_SECTIONS,
    'Commercial concept',
    'Opening hook',
    'Camera',
    'Product motion',
    'Environment',
    'Lighting',
    'Sequence',
    'Editing rhythm',
    'Audio',
    'Hero ending',
    'Visual quality',
    'Avoidance',
  ],
  beats: { default: 5, max: 7 },
  shotSecondsRange: [0.6, 1.8],
  energy: 'high',
  cameraVocabulary: [
    'whip pan',
    'snap zoom',
    'crash zoom',
    'fast orbit',
    'aggressive push-in',
    'fast lateral tracking',
    'macro insert',
    'speed ramp',
    'low-angle hero tracking',
    'parallax move',
  ],
  transitions: [
    'whip transition',
    'match cut on movement',
    'object wipe',
    'speed ramp',
    'flash cut',
    'push-through transition',
  ],
  productMotion: ['rotate', 'spin', 'float', 'glide', 'launch toward camera', 'react to light'],
  atmosphere: ['particles', 'atmospheric haze', 'volumetric light', 'moving reflections'],
  interactionBoundary: null,
} as const satisfies Record<string, unknown>;

const LIFESTYLE_STORY = {
  id: 'lifestyle-story',
  version: 2,
  labelUz: 'Hayotiy lavha',
  descriptionUz:
    "Mahsulot kundalik hayotda ishlatilayotgan qisqa va tabiiy lavha.",
  intent:
    'A small believable moment from someone’s day in which the product is used. The product stays dominant; the person is context, never the subject.',
  sections: [
    ...FIDELITY_SECTIONS,
    'Commercial concept',
    'Creative direction',
    'Opening hook',
    'Talent and interaction',
    'Camera',
    'Environment',
    'Lighting',
    'Sequence',
    'Editing rhythm',
    'Audio',
    'Hero ending',
    'Fidelity requirements',
    'Avoidance',
  ],
  beats: { default: 3, max: 4 },
  shotSecondsRange: [1.8, 3.5],
  energy: 'moderate',
  cameraVocabulary: [
    'handheld drift',
    'gentle tracking',
    'over-the-shoulder framing',
    'slow push-in',
    'natural reframe',
    'focus pull',
  ],
  transitions: ['direct cut', 'match cut on movement', 'soft foreground wipe'],
  productMotion: ['natural handling by the person'],
  atmosphere: [],
  interactionBoundary: 
    'People may only touch and use the surfaces the reference shows. Do not open doors, lids, cases, bags, boxes or packaging, and do not reveal any inside, back or underside the reference never established; if natural use would require that, show the moment just before it instead.',
} as const satisfies Record<string, unknown>;

const UGC_AUTHENTIC = {
  id: 'ugc-authentic',
  version: 2,
  labelUz: 'Tabiiy UGC',
  descriptionUz:
    "Xaridorning o'zi telefonda suratga olgandek ko'rinadigan, sun'iy bo'lmagan video.",
  intent:
    'Footage that looks filmed by a real customer on a phone, not by a crew. Slight imperfection is the point, but the product must still read clearly.',
  sections: [
    ...FIDELITY_SECTIONS,
    'Commercial concept',
    'Opening hook',
    'Talent and interaction',
    'Camera',
    'Environment',
    'Lighting',
    'Sequence',
    'Audio',
    'Hero ending',
    'Avoidance',
  ],
  beats: { default: 3, max: 4 },
  shotSecondsRange: [1.5, 3],
  energy: 'moderate',
  cameraVocabulary: [
    'handheld phone framing',
    'quick reframe',
    'arm-length selfie framing',
    'casual pan',
    'close handheld detail',
  ],
  transitions: ['direct cut', 'quick handheld reframe'],
  productMotion: ['natural handling by the person'],
  atmosphere: [],
  interactionBoundary: null,
} as const satisfies Record<string, unknown>;

const REGISTRY: ReadonlyMap<string, CreativeFormat> = new Map(
  [PRODUCT_FILM, HIGH_ENERGY, LIFESTYLE_STORY, UGC_AUTHENTIC].map((entry) => {
    const format = creativeFormatSchema.parse(entry);
    return [format.id, format];
  }),
);

export const DEFAULT_FORMAT_ID = PRODUCT_FILM.id;

export function listFormats(): CreativeFormat[] {
  return [...REGISTRY.values()];
}

export function findFormat(id: string): CreativeFormat | undefined {
  return REGISTRY.get(id);
}

/**
 * D-065: the seller names the format themselves, so there is no style to map from.
 *
 * Falling back to the restrained format is deliberate and stays: an id nothing defines
 * must not silently gain permission to whip-pan around a product. The zod enum on the
 * brief means this should be unreachable through the API — it guards the CLI and any
 * future caller that builds a brief by hand.
 */
export function formatForBrief(brief: Brief): CreativeFormat {
  return REGISTRY.get(brief.formatId) ?? (REGISTRY.get(DEFAULT_FORMAT_ID) as CreativeFormat);
}

