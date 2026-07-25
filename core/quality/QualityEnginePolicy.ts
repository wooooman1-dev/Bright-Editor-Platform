import { QualityEngine as BaseQualityEngine } from "./QualityEngine";

/**
 * Public policy entry point.
 *
 * Quality scoring is implemented by the platform-independent base engine and is
 * based on intent alignment, information sufficiency, safety, structure, and
 * usefulness. Prose character counts remain telemetry only.
 */
export class QualityEngine extends BaseQualityEngine {}
