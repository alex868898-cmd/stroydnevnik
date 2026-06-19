export interface Project {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  status: 'active' | 'paused' | 'frozen' | 'completed';
  created_at: string;
}

export interface WorkItem {
  action: string;
  workType: string;
  volume: number | null;
  unit: string | null;
  pricePerUnit: number | null;
  total: number | null;
  priceFromCatalog: boolean;
}

export interface WorkLog {
  id: string;
  user_id: string;
  project_id: string | null;
  work_date: string; // YYYY-MM-DD
  voice_transcript: string | null;
  work_items: WorkItem[];
  total_amount: number;
  volumes_confirmed: boolean;
  is_day_off: boolean;
  created_at: string;
}

export interface PriceCatalog {
  id: string;
  user_id: string | null;
  work_type: string;
  unit: string;
  unit_type: 'sq_m' | 'lm' | 'service';
  base_price: number;
  region: string | null;
  created_at: string;
}

export interface EstimateHistory {
  id: string;
  project_id: string;
  user_id: string;
  last_work_log_id: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface ParsedSegment {
  projectId: string | null;
  projectHint: string | null;
  items: WorkItem[];
}

export interface ClarificationPrompt {
  segmentIndex: number;
  itemIndex: number;
  workTypePlaceholder: string; // The ambiguous search query (e.g. "шпаклівка")
  options: string[]; // Options from price catalog (e.g. ["Шпаклівка стін стартова", "Шпаклівка стін фінішна"])
}

export interface ParsedWorkLog {
  segments: ParsedSegment[];
  clarifications: ClarificationPrompt[];
}
