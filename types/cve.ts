export interface NvdCveItem {
  cve: Cve;
}

export interface Cve {
  id: string;
  sourceIdentifier: string;
  published: string; // ISO datetime
  lastModified: string; // ISO datetime
  vulnStatus: string;

  cveTags: string[];

  descriptions: CveLangValue[];
  metrics?: CveMetrics;
  weaknesses?: CveWeakness[];
  references?: CveReference[];
}

export interface CveLangValue {
  lang: string; // "en", "ko" 등
  value: string;
}

export interface CveMetrics {
  cvssMetricV40?: CvssMetricV40[];
  // 추후 v3.1 등 추가 대비
}

export interface CvssMetricV40 {
  source: string;
  type: 'Primary' | 'Secondary' | string;
  cvssData: CvssV40Data;
}

export interface CvssV40Data {
  version: '4.0';
  vectorString: string;

  baseScore: number;
  baseSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  attackVector: 'NETWORK' | 'ADJACENT' | 'LOCAL' | 'PHYSICAL';
  attackComplexity: 'LOW' | 'HIGH';
  attackRequirements: 'NONE' | 'PRESENT';
  privilegesRequired: 'NONE' | 'LOW' | 'HIGH';
  userInteraction: 'NONE' | 'PASSIVE' | 'ACTIVE';

  vulnConfidentialityImpact: 'NONE' | 'LOW' | 'HIGH';
  vulnIntegrityImpact: 'NONE' | 'LOW' | 'HIGH';
  vulnAvailabilityImpact: 'NONE' | 'LOW' | 'HIGH';

  subConfidentialityImpact: 'NONE' | 'LOW' | 'HIGH';
  subIntegrityImpact: 'NONE' | 'LOW' | 'HIGH';
  subAvailabilityImpact: 'NONE' | 'LOW' | 'HIGH';

  exploitMaturity: CvssDefined;
  confidentialityRequirement: CvssDefined;
  integrityRequirement: CvssDefined;
  availabilityRequirement: CvssDefined;

  modifiedAttackVector: CvssDefined;
  modifiedAttackComplexity: CvssDefined;
  modifiedAttackRequirements: CvssDefined;
  modifiedPrivilegesRequired: CvssDefined;
  modifiedUserInteraction: CvssDefined;

  modifiedVulnConfidentialityImpact: CvssDefined;
  modifiedVulnIntegrityImpact: CvssDefined;
  modifiedVulnAvailabilityImpact: CvssDefined;

  modifiedSubConfidentialityImpact: CvssDefined;
  modifiedSubIntegrityImpact: CvssDefined;
  modifiedSubAvailabilityImpact: CvssDefined;

  Safety: CvssDefined;
  Automatable: CvssDefined;
  Recovery: CvssDefined;
  valueDensity: CvssDefined;
  vulnerabilityResponseEffort: CvssDefined;
  providerUrgency: CvssDefined;
}

export type CvssDefined = 'NOT_DEFINED' | 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface CveWeakness {
  source: string;
  type: 'Primary' | 'Secondary' | string;
  description: CveLangValue[];
}

export interface CveReference {
  url: string;
  source: string;
}

export interface NvdCveChangeWrapper {
  change: NvdCveChange;
}

export interface NvdCveChange {
  cveId: string; // CVE-YYYY-NNNNN
  eventName: string; // e.g. "New CVE Received"
  cveChangeId: string; // UUID
  sourceIdentifier: string; // e.g. cna@vuldb.com
  created: string; // ISO-8601
  details: NvdCveChangeDetail[];
}

export interface NvdCveChangeDetail {
  action: 'Added' | 'Updated' | 'Removed';
  type: NvdCveChangeDetailType;
  newValue?: string;
  oldValue?: string;
}

export type NvdCveChangeDetailType =
  | 'Description'
  | 'CVSS V4.0'
  | 'CVSS V3.1'
  | 'CVSS V3.0'
  | 'CVSS V2'
  | 'CWE'
  | 'Reference'
  | 'CPE'
  | 'Configuration'
  | 'Vendor Comment'
  | 'Weakness'
  | 'Exploit'
  | 'Impact'
  | string; // future-proof
