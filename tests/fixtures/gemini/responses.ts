// SYNTHETIC model responses shaped like Gemini's JSON output for our schema.
// They are written by hand to exercise the parser and sanitizer; they are NOT recorded from the
// real API. Replace or extend them with real recorded responses once the Gemini key exists
// (CHECKLIST P5.35).

export const RESPONSES = {
  explicitPerfume: {
    evidence: "أبعاد العلبة: ٧ × ٧ × ١٦ سم، والوزن مع التغليف ٤٢٠ جرام",
    dimsSource: "page", lengthCm: 7, widthCm: 7, heightCm: 16,
    weightSource: "page", weightG: 420,
    fragile: true, liquid: true, sensitive: false, confidence: "high",
  },
  inferredPerfume: {
    evidence: "inferred from 50 ml perfume bottle in a carton box",
    dimsSource: "inferred", lengthCm: 6, widthCm: 5, heightCm: 12,
    weightSource: "inferred", weightG: 250,
    fragile: true, liquid: true, sensitive: false, confidence: "medium",
  },
  noInfo: {
    evidence: "no size or weight information on the page",
    dimsSource: "unknown", lengthCm: null, widthCm: null, heightCm: null,
    weightSource: "unknown", weightG: null,
    fragile: false, liquid: false, sensitive: false, confidence: "low",
  },
  outOfRange: {
    evidence: "Dimensions: 400 x 10 x 10",
    dimsSource: "page", lengthCm: 400, widthCm: 10, heightCm: 10,
    weightSource: "page", weightG: 99999,
    fragile: false, liquid: false, sensitive: false, confidence: "high",
  },
  pageButLowConfidence: {
    evidence: "size mentioned loosely",
    dimsSource: "page", lengthCm: 20, widthCm: 10, heightCm: 5,
    weightSource: "page", weightG: 300,
    fragile: false, liquid: false, sensitive: false, confidence: "low",
  },
  unknownWithValue: {
    evidence: "guess",
    dimsSource: "unknown", lengthCm: 10, widthCm: 10, heightCm: 10,
    weightSource: "unknown", weightG: 500,
    fragile: false, liquid: false, sensitive: false, confidence: "low",
  },
} as const;
